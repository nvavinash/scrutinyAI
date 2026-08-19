const fs = require('fs');
const path = require('path');

const LIMITATION_RULES_PATH = path.join(__dirname, '../data/limitationRules.json');

let cachedRulesData = null;

/**
 * Load Limitation Rules JSON data from disk.
 */
const getLimitationRulesData = () => {
  if (cachedRulesData) return cachedRulesData;
  return reloadLimitationRulesData();
};

/**
 * Force reload Limitation Rules data from disk.
 */
const reloadLimitationRulesData = () => {
  try {
    if (!fs.existsSync(LIMITATION_RULES_PATH)) {
      console.warn(`[Limitation Service] Rules file not found at ${LIMITATION_RULES_PATH}`);
      return { rules: [] };
    }
    const content = fs.readFileSync(LIMITATION_RULES_PATH, 'utf-8');
    cachedRulesData = JSON.parse(content);
    return cachedRulesData;
  } catch (err) {
    console.error(`[Limitation Service Error] Failed to load rules:`, err.message);
    return { rules: [] };
  }
};

/**
 * Convert Hindi/Devanagari numerals to standard ASCII digits.
 */
const convertDevanagariDigits = (str) => {
  if (!str) return str;
  const devanagariMap = {
    '०': '0', '१': '1', '२': '2', '३': '3', '४': '4',
    '५': '5', '६': '6', '७': '7', '८': '8', '९': '9'
  };
  return String(str).replace(/[०-९]/g, (w) => devanagariMap[w]);
};

/**
 * Check if a year is a leap year.
 */
const isLeapYear = (year) => {
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
};

/**
 * Get number of days in a given month (1-indexed month: 1 for Jan, 2 for Feb... 12 for Dec).
 */
const getDaysInMonth = (year, month) => {
  const daysMap = [0, 31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return daysMap[month] || 0;
};

/**
 * Month name parser mapping English & common text representations to month number (1-12).
 */
const MONTH_NAMES = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, september: 9, sept: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

/**
 * Deterministically parse a date string into a structured Date object and formatted ISO date string (YYYY-MM-DD).
 * Handles:
 * - Devanagari numerals
 * - YYYY-MM-DD
 * - DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
 * - YYYY/MM/DD
 * - Textual dates (e.g. 15 Jan 2023, 29 February 2024)
 * - Leap year and month boundary validation
 * 
 * Returns { dateObj, formattedDate } or null if invalid or unparseable.
 */
const parseDate = (rawInput) => {
  if (rawInput === null || rawInput === undefined) return null;

  let str = convertDevanagariDigits(String(rawInput)).trim();
  if (!str) return null;

  // Clean noise, quotes, extra spaces
  str = str.replace(/['"]/g, '').trim();

  let year = null;
  let month = null;
  let day = null;

  // 1. Check YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (isoMatch) {
    year = parseInt(isoMatch[1], 10);
    month = parseInt(isoMatch[2], 10);
    day = parseInt(isoMatch[3], 10);
  }

  // 2. Check DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
  if (!year) {
    const dmyMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
    if (dmyMatch) {
      day = parseInt(dmyMatch[1], 10);
      month = parseInt(dmyMatch[2], 10);
      year = parseInt(dmyMatch[3], 10);
    }
  }

  // 3. Check Textual dates like "15 Jan 2023" or "15-Jan-2023" or "January 15, 2023"
  if (!year) {
    const textMatch1 = str.match(/^(\d{1,2})[\s\-\/\.]?([a-zA-Z]+)[\s\-\/\.,]+(\d{4})$/);
    if (textMatch1) {
      day = parseInt(textMatch1[1], 10);
      const monthStr = textMatch1[2].toLowerCase();
      month = MONTH_NAMES[monthStr] || null;
      year = parseInt(textMatch1[3], 10);
    } else {
      const textMatch2 = str.match(/^([a-zA-Z]+)[\s\-\/\.]?(\d{1,2})[\s\-\/\.,]+(\d{4})$/);
      if (textMatch2) {
        const monthStr = textMatch2[1].toLowerCase();
        month = MONTH_NAMES[monthStr] || null;
        day = parseInt(textMatch2[2], 10);
        year = parseInt(textMatch2[3], 10);
      }
    }
  }

  // 4. Try JS Date constructor fallback for standard ISO strings
  if (!year || !month || !day) {
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      year = d.getUTCFullYear();
      month = d.getUTCMonth() + 1;
      day = d.getUTCDate();
    }
  }

  if (!year || !month || !day) {
    return null;
  }

  // Range and validity checks
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1) {
    return null;
  }

  const maxDays = getDaysInMonth(year, month);
  if (day > maxDays) {
    return null; // Invalid day for given month/year (e.g. Feb 30 or Feb 29 on non-leap year)
  }

  const pad = (n) => String(n).padStart(2, '0');
  const formattedDate = `${year}-${pad(month)}-${pad(day)}`;
  const dateObj = new Date(Date.UTC(year, month - 1, day));

  return {
    year,
    month,
    day,
    formattedDate,
    dateObj
  };
};

/**
 * Deterministically calculate expiry date by adding period (days or years) to a parsed starting date.
 * Handles month-end clamping for leap years and different month lengths.
 */
const calculateExpiry = (parsedStartDate, period, unit) => {
  if (!parsedStartDate || !period || !unit) return null;

  const { year, month, day } = parsedStartDate;
  let targetYear = year;
  let targetMonth = month;
  let targetDay = day;

  if (unit === 'years') {
    targetYear = year + period;
    targetMonth = month;
    const maxDays = getDaysInMonth(targetYear, targetMonth);
    targetDay = Math.min(day, maxDays);
  } else if (unit === 'days') {
    // Add exact days using UTC Date millisecond arithmetic
    const startUtcMs = Date.UTC(year, month - 1, day);
    const addedMs = period * 24 * 60 * 60 * 1000;
    const expiryUtcDate = new Date(startUtcMs + addedMs);

    targetYear = expiryUtcDate.getUTCFullYear();
    targetMonth = expiryUtcDate.getUTCMonth() + 1;
    targetDay = expiryUtcDate.getUTCDate();
  } else {
    return null;
  }

  const pad = (n) => String(n).padStart(2, '0');
  const formattedDate = `${targetYear}-${pad(targetMonth)}-${pad(targetDay)}`;
  const dateObj = new Date(Date.UTC(targetYear, targetMonth - 1, targetDay));

  return {
    year: targetYear,
    month: targetMonth,
    day: targetDay,
    formattedDate,
    dateObj
  };
};

/**
 * Extract Section ("19" or "17") deterministically without guessing.
 */
const parseSection = (input) => {
  if (!input) return null;

  let rawSection = '';
  if (typeof input === 'string') {
    rawSection = input;
  } else if (typeof input === 'object') {
    rawSection = [
      input.section,
      input.caseTypeOrAct,
      input.caseType,
      input.act
    ].filter(Boolean).join(' ');
  }

  const str = convertDevanagariDigits(rawSection).toLowerCase();

  // Check explicit section 19 patterns
  if (
    str.includes('section 19') ||
    str.includes('sec 19') ||
    str.includes('sec. 19') ||
    str.includes('धारा 19') ||
    str.includes('recovery of debt') ||
    str.includes('rddbfi') ||
    str.includes('rdb act') ||
    /\b19\b/.test(str)
  ) {
    if (!str.includes('section 17') && !str.includes('धारा 17')) {
      return '19';
    }
  }

  // Check explicit section 17 patterns
  if (
    str.includes('section 17') ||
    str.includes('sec 17') ||
    str.includes('sec. 17') ||
    str.includes('धारा 17') ||
    str.includes('sarfaesi') ||
    str.includes('13(4)') ||
    /\b17\b/.test(str)
  ) {
    if (!str.includes('section 19') && !str.includes('धारा 19')) {
      return '17';
    }
  }

  if (input.section === '19' || input.section === 19) return '19';
  if (input.section === '17' || input.section === 17) return '17';

  return null;
};

/**
 * Resolve starting date and filing date from input object based on proceeding section.
 */
const resolveDates = (input, section) => {
  if (!input || typeof input !== 'object') {
    return { startingDateRaw: null, filingDateRaw: null, startingEvent: null };
  }

  const filingDateRaw = input.filingDate || null;

  let startingDateRaw = null;
  let startingEvent = null;

  if (section === '17') {
    // SARFAESI Section 17 prioritizes possession / measure / order date
    if (input.possessionNoticeDate) {
      startingDateRaw = input.possessionNoticeDate;
      startingEvent = 'possessionNoticeDate';
    } else if (input.measureDate) {
      startingDateRaw = input.measureDate;
      startingEvent = 'measureDate';
    } else if (input.orderDate || input.relevantOrderDate) {
      startingDateRaw = input.orderDate || input.relevantOrderDate;
      startingEvent = 'orderDate';
    } else if (input.causeOfActionDate) {
      startingDateRaw = input.causeOfActionDate;
      startingEvent = 'causeOfActionDate';
    } else if (input.otherRelevantDate) {
      startingDateRaw = input.otherRelevantDate;
      startingEvent = 'otherRelevantDate';
    }
  } else if (section === '19') {
    // RDDBFI Section 19 prioritizes cause of action / demand notice date
    if (input.causeOfActionDate) {
      startingDateRaw = input.causeOfActionDate;
      startingEvent = 'causeOfActionDate';
    } else if (input.demandNoticeDate) {
      startingDateRaw = input.demandNoticeDate;
      startingEvent = 'demandNoticeDate';
    } else if (input.orderDate || input.relevantOrderDate) {
      startingDateRaw = input.orderDate || input.relevantOrderDate;
      startingEvent = 'orderDate';
    } else if (input.measureDate) {
      startingDateRaw = input.measureDate;
      startingEvent = 'measureDate';
    } else if (input.possessionNoticeDate) {
      startingDateRaw = input.possessionNoticeDate;
      startingEvent = 'possessionNoticeDate';
    } else if (input.otherRelevantDate) {
      startingDateRaw = input.otherRelevantDate;
      startingEvent = 'otherRelevantDate';
    }
  } else {
    // Generic fallback date resolution
    startingDateRaw =
      input.causeOfActionDate ||
      input.possessionNoticeDate ||
      input.demandNoticeDate ||
      input.measureDate ||
      input.orderDate ||
      input.relevantOrderDate ||
      input.otherRelevantDate ||
      null;
    startingEvent = startingDateRaw ? 'relevantDate' : null;
  }

  return {
    startingDateRaw,
    filingDateRaw,
    startingEvent
  };
};

/**
 * Reusable Limitation Scrutiny Engine Service.
 * 
 * Performs deterministic statutory limitation calculations without using LLM.
 * 
 * @param {Object} input - Case information or explicit inputs containing section, relevant dates, filing date.
 * @returns {Object} Structured Limitation Scrutiny Result.
 */
const calculateLimitation = (input) => {
  const fallbackResult = {
    applicable: false,
    section: null,
    proceedingType: null,
    startingDate: null,
    limitationPeriod: null,
    expiryDate: null,
    filingDate: null,
    status: 'Manual verification required',
    reason: 'Manual verification required due to missing or unverified information.',
    source: null,
    manualVerificationRequired: true
  };

  if (!input || typeof input !== 'object') {
    return fallbackResult;
  }

  const section = parseSection(input);
  const rulesData = getLimitationRulesData();
  const rules = Array.isArray(rulesData.rules) ? rulesData.rules : [];
  const rule = rules.find((r) => r.section === section);

  // If statutory rule cannot be reliably identified
  if (!section || !rule) {
    return {
      ...fallbackResult,
      section: section || null,
      reason: 'Manual verification required: Statutory limitation rule could not be reliably identified from case information.'
    };
  }

  const { startingDateRaw, filingDateRaw } = resolveDates(input, section);

  const parsedStartingDate = parseDate(startingDateRaw);
  const parsedFilingDate = parseDate(filingDateRaw);

  const startingDateStr = parsedStartingDate ? parsedStartingDate.formattedDate : (startingDateRaw || null);
  const filingDateStr = parsedFilingDate ? parsedFilingDate.formattedDate : (filingDateRaw || null);

  // Check for missing or invalid dates
  if (!parsedStartingDate || !parsedFilingDate) {
    let missingReason = 'Manual verification required due to missing or invalid date information.';
    if (!parsedStartingDate && !parsedFilingDate) {
      missingReason = 'Manual verification required: Missing relevant starting date and filing date.';
    } else if (!parsedStartingDate) {
      missingReason = 'Manual verification required: Missing or invalid relevant starting date.';
    } else if (!parsedFilingDate) {
      missingReason = 'Manual verification required: Missing or invalid filing date.';
    }

    return {
      applicable: false,
      section: section,
      proceedingType: rule.proceedingType,
      startingDate: startingDateStr,
      limitationPeriod: `${rule.limitationPeriod} ${rule.limitationUnit}`,
      expiryDate: null,
      filingDate: filingDateStr,
      status: 'Manual verification required',
      reason: missingReason,
      source: rule.source,
      manualVerificationRequired: true
    };
  }

  // Calculate expiry date deterministically
  const parsedExpiryDate = calculateExpiry(parsedStartingDate, rule.limitationPeriod, rule.limitationUnit);

  if (!parsedExpiryDate) {
    return {
      applicable: false,
      section: section,
      proceedingType: rule.proceedingType,
      startingDate: startingDateStr,
      limitationPeriod: `${rule.limitationPeriod} ${rule.limitationUnit}`,
      expiryDate: null,
      filingDate: filingDateStr,
      status: 'Manual verification required',
      reason: 'Manual verification required: Failed to calculate expiry date.',
      source: rule.source,
      manualVerificationRequired: true
    };
  }

  const expiryDateStr = parsedExpiryDate.formattedDate;

  // Perform date comparison deterministically
  const filingTime = parsedFilingDate.dateObj.getTime();
  const expiryTime = parsedExpiryDate.dateObj.getTime();

  let status = '';
  let reason = '';

  if (filingTime <= expiryTime) {
    status = 'Within limitation';
    reason = 'Limitation appears to be within the configured period.';
  } else {
    status = 'Limitation period appears expired';
    reason = 'Limitation period appears expired based on the configured rule.';
  }

  return {
    applicable: true,
    section: section,
    proceedingType: rule.proceedingType,
    startingDate: startingDateStr,
    limitationPeriod: `${rule.limitationPeriod} ${rule.limitationUnit}`,
    expiryDate: expiryDateStr,
    filingDate: filingDateStr,
    status: status,
    reason: reason,
    source: rule.source,
    manualVerificationRequired: false
  };
};

module.exports = {
  getLimitationRulesData,
  reloadLimitationRulesData,
  parseDate,
  calculateExpiry,
  parseSection,
  resolveDates,
  calculateLimitation
};
