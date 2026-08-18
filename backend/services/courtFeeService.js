const fs = require('fs');
const path = require('path');

const FEE_RULES_PATH = path.join(__dirname, '../data/courtFeeRules.json');

let cachedRulesData = null;

/**
 * Load Court Fee Rules JSON data from disk.
 */
const getCourtFeeRulesData = () => {
  if (cachedRulesData) return cachedRulesData;
  return reloadCourtFeeRulesData();
};

/**
 * Force reload Court Fee Rules data.
 */
const reloadCourtFeeRulesData = () => {
  try {
    if (!fs.existsSync(FEE_RULES_PATH)) {
      console.warn(`[Court Fee Service] Rules file not found at ${FEE_RULES_PATH}`);
      return { rules: [] };
    }
    const content = fs.readFileSync(FEE_RULES_PATH, 'utf-8');
    cachedRulesData = JSON.parse(content);
    return cachedRulesData;
  } catch (err) {
    console.error(`[Court Fee Service Error] Failed to load rules:`, err.message);
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
  return str.replace(/[०-९]/g, (w) => devanagariMap[w]);
};

/**
 * Parse raw claim amount input into a valid positive number or null.
 * Strictly avoids guessing.
 */
const parseClaimAmount = (amountInput) => {
  if (amountInput === null || amountInput === undefined) return null;

  if (typeof amountInput === 'number') {
    return amountInput > 0 ? amountInput : null;
  }

  let str = convertDevanagariDigits(String(amountInput)).trim().toLowerCase();
  if (!str) return null;

  // Check for textual amounts like "10 Lakhs", "1.5 Crore"
  let multiplier = 1;
  if (str.includes('crore') || str.includes('करोड़')) {
    multiplier = 10000000;
  } else if (str.includes('lakh') || str.includes('लाख')) {
    multiplier = 100000;
  }

  // Remove currency symbols, commas, spaces, and text
  const cleanStr = str.replace(/[^0-9.]/g, '');
  if (!cleanStr) return null;

  const parsed = parseFloat(cleanStr);
  if (isNaN(parsed) || parsed <= 0) return null;

  const total = Math.round(parsed * multiplier);
  return total > 0 ? total : null;
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
    // Make sure it doesn't also explicitly mention section 17 unless 19 is dominant
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

  // Direct exact match
  if (input.section === '19' || input.section === 19) return '19';
  if (input.section === '17' || input.section === 17) return '17';

  return null;
};

/**
 * Extract Applicant Type ("bank", "borrower", "aggrieved_party") deterministically.
 */
const parseApplicantType = (input, section) => {
  if (!input || typeof input !== 'object') return null;

  let rawType = [
    input.applicantType,
    input.applicantCategory,
    input.applicantName
  ].filter(Boolean).join(' ').toLowerCase();

  if (!rawType.trim()) {
    // For section 19, the rule applies to any Section 19 debt recovery application.
    if (section === '19') {
      return 'bank';
    }
    return null;
  }

  if (
    rawType.includes('borrower') ||
    rawType.includes('ऋणी') ||
    rawType.includes('देनदार') ||
    rawType.includes('debtor')
  ) {
    return 'borrower';
  }

  if (
    rawType.includes('bank') ||
    rawType.includes('financial institution') ||
    rawType.includes('fi') ||
    rawType.includes('creditor') ||
    rawType.includes('बैंक')
  ) {
    if (section === '19') return 'bank';
    return 'aggrieved_party';
  }

  if (
    rawType.includes('aggrieved') ||
    rawType.includes('non-borrower') ||
    rawType.includes('non_borrower') ||
    rawType.includes('third party') ||
    rawType.includes('third_party') ||
    rawType.includes('other than borrower') ||
    rawType.includes('व्यथित') ||
    rawType.includes('अन्य')
  ) {
    return 'aggrieved_party';
  }

  if (section === '19') {
    return input.applicantType || 'bank';
  }

  return null;
};

/**
 * Reusable Court Fee Engine Service.
 * 
 * Deterministically calculates court fee according to statutory rules.
 * 
 * @param {Object} input - Input containing section, applicantType, claimAmount / debtOrClaimAmount
 * @returns {Object} Structured Court Fee Scrutiny Result
 */
const calculateCourtFee = (input) => {
  const fallbackResult = {
    applicable: null,
    section: null,
    applicantType: null,
    claimAmount: null,
    calculatedFee: null,
    currency: 'INR',
    rule: null,
    source: null,
    status: 'Manual verification required',
    manualVerificationRequired: true
  };

  if (!input || typeof input !== 'object') {
    return fallbackResult;
  }

  const section = parseSection(input);
  const claimAmount = parseClaimAmount(input.claimAmount || input.debtAmount || input.debtOrClaimAmount);
  const applicantType = parseApplicantType(input, section);

  // If section or amount could not be reliably identified, return manual verification required
  if (!section || claimAmount === null) {
    return {
      ...fallbackResult,
      section: section || null,
      applicantType: applicantType || null,
      claimAmount: claimAmount || null
    };
  }

  // Load rules config
  const rulesData = getCourtFeeRulesData();
  const rules = Array.isArray(rulesData.rules) ? rulesData.rules : [];

  // ==========================================
  // SECTION 19 — RECOVERY OF DEBTS ACT, 1993
  // ==========================================
  if (section === '19') {
    const ruleConfig = rules.find((r) => r.section === '19') || {
      ruleName: 'Rule 7 of the Debts Recovery Tribunal (Procedure) Rules, 1993',
      source: 'Debts Recovery Tribunal (Procedure) Rules, 1993, Rule 7'
    };

    let calculatedFee = 0;
    const threshold = 1000000; // ₹10,00,000

    if (claimAmount <= threshold) {
      calculatedFee = 12000;
    } else {
      const excess = claimAmount - threshold;
      const slabs = Math.ceil(excess / 100000);
      calculatedFee = 12000 + (slabs * 1000);
    }

    // Maximum fee cap ₹1,50,000
    calculatedFee = Math.min(calculatedFee, 150000);

    return {
      applicable: true,
      section: '19',
      applicantType: applicantType || 'bank',
      claimAmount: claimAmount,
      calculatedFee: calculatedFee,
      currency: 'INR',
      rule: ruleConfig.ruleName,
      source: ruleConfig.source,
      status: 'Calculated fee according to configured Rule 7.',
      manualVerificationRequired: false
    };
  }

  // ==========================================
  // SECTION 17 — SARFAESI ACT, 2002
  // ==========================================
  if (section === '17') {
    // For Section 17, applicantType must be reliably identified (borrower vs aggrieved_party/non-borrower)
    if (!applicantType || (applicantType !== 'borrower' && applicantType !== 'aggrieved_party')) {
      return {
        ...fallbackResult,
        section: '17',
        applicantType: null,
        claimAmount: claimAmount
      };
    }

    let calculatedFee = 0;
    const threshold = 1000000; // ₹10,00,000

    if (applicantType === 'borrower') {
      const ruleConfig = rules.find((r) => r.id === 'RULE_SECTION_17_BORROWER') || {
        ruleName: 'Rule 13 of the Security Interest (Enforcement) Rules, 2002 (Borrower)',
        source: 'Security Interest (Enforcement) Rules, 2002, Rule 13'
      };

      if (claimAmount < threshold) {
        const slabs = Math.ceil(claimAmount / 100000);
        calculatedFee = slabs * 500;
      } else {
        const excess = claimAmount - threshold;
        const slabs = Math.ceil(excess / 100000);
        calculatedFee = 5000 + (slabs * 250);
      }

      // Maximum fee cap ₹1,00,000
      calculatedFee = Math.min(calculatedFee, 100000);

      return {
        applicable: true,
        section: '17',
        applicantType: 'borrower',
        claimAmount: claimAmount,
        calculatedFee: calculatedFee,
        currency: 'INR',
        rule: ruleConfig.ruleName,
        source: ruleConfig.source,
        status: 'Calculated fee according to configured Rule 13.',
        manualVerificationRequired: false
      };
    }

    if (applicantType === 'aggrieved_party') {
      const ruleConfig = rules.find((r) => r.id === 'RULE_SECTION_17_NON_BORROWER') || {
        ruleName: 'Rule 13 of the Security Interest (Enforcement) Rules, 2002 (Aggrieved party other than borrower)',
        source: 'Security Interest (Enforcement) Rules, 2002, Rule 13'
      };

      if (claimAmount < threshold) {
        const slabs = Math.ceil(claimAmount / 100000);
        calculatedFee = slabs * 125;
      } else {
        const excess = claimAmount - threshold;
        const slabs = Math.ceil(excess / 100000);
        calculatedFee = 1250 + (slabs * 125);
      }

      // Maximum fee cap ₹50,000
      calculatedFee = Math.min(calculatedFee, 50000);

      return {
        applicable: true,
        section: '17',
        applicantType: 'aggrieved_party',
        claimAmount: claimAmount,
        calculatedFee: calculatedFee,
        currency: 'INR',
        rule: ruleConfig.ruleName,
        source: ruleConfig.source,
        status: 'Calculated fee according to configured Rule 13.',
        manualVerificationRequired: false
      };
    }
  }

  return fallbackResult;
};

module.exports = {
  getCourtFeeRulesData,
  reloadCourtFeeRulesData,
  parseClaimAmount,
  parseSection,
  parseApplicantType,
  calculateCourtFee
};
