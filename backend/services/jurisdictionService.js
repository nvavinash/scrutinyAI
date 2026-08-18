const fs = require('fs');
const path = require('path');

const JURISDICTION_DATA_PATH = path.join(__dirname, '../data/drtJurisdiction.json');

let cachedData = null;

/**
 * Load DRT jurisdiction JSON data from disk.
 * Returns cached copy if already loaded.
 */
const getJurisdictionData = () => {
  if (cachedData) return cachedData;
  return reloadJurisdictionData();
};

/**
 * Force reload DRT jurisdiction data from disk.
 */
const reloadJurisdictionData = () => {
  try {
    if (!fs.existsSync(JURISDICTION_DATA_PATH)) {
      console.warn(`[Jurisdiction Service] Data file not found at ${JURISDICTION_DATA_PATH}`);
      cachedData = { version: '1.0.0', totalExpectedDrts: 39, drts: [] };
      return cachedData;
    }

    const fileContent = fs.readFileSync(JURISDICTION_DATA_PATH, 'utf-8');
    cachedData = JSON.parse(fileContent);
    return cachedData;
  } catch (error) {
    console.error(`[Jurisdiction Service Error] Failed to load data:`, error.message);
    cachedData = { version: '1.0.0', totalExpectedDrts: 39, drts: [] };
    return cachedData;
  }
};

/**
 * Get list of all DRT entries.
 */
const getAllDrts = () => {
  const data = getJurisdictionData();
  return Array.isArray(data.drts) ? data.drts : [];
};

/**
 * Find DRT by exact or partial name match.
 */
const getDrtByName = (drtName) => {
  if (!drtName) return null;
  const drts = getAllDrts();
  const search = drtName.trim().toLowerCase();
  return drts.find((drt) => drt.drtName && drt.drtName.toLowerCase() === search) || null;
};

/**
 * Get all DRTs belonging to a specific State / UT.
 */
const getDrtsByState = (stateUt) => {
  if (!stateUt) return [];
  const drts = getAllDrts();
  const search = stateUt.trim().toLowerCase();
  return drts.filter((drt) => drt.stateUt && drt.stateUt.toLowerCase() === search);
};

/**
 * Find DRT whose jurisdiction covers a given district.
 */
const getDrtByDistrict = (districtName) => {
  if (!districtName) return null;
  const drts = getAllDrts();
  const search = districtName.trim().toLowerCase();
  return (
    drts.find(
      (drt) =>
        Array.isArray(drt.districts) &&
        drt.districts.some((dist) => dist.toLowerCase() === search)
    ) || null
  );
};

/**
 * Deterministically match extracted case information against DRT jurisdiction database.
 * Does NOT use LLM for decision making.
 * 
 * @param {Object} caseInfo - Extracted case information object
 * @returns {Object} Structured jurisdiction result
 */
const determineJurisdiction = (caseInfo) => {
  const fallbackResult = {
    possibleDRT: null,
    matchingLocation: null,
    reason: "Insufficient jurisdiction information",
    ruleSource: null,
    manualVerificationRequired: true,
  };

  if (!caseInfo || typeof caseInfo !== 'object') {
    return fallbackResult;
  }

  const drts = getAllDrts();
  if (!Array.isArray(drts) || drts.length === 0) {
    return fallbackResult;
  }

  // Priority order for checking location sources
  const locationSources = [
    { key: 'securedAssetAddress', name: 'Secured asset location', sourceRule: 'Section 17(1), SARFAESI Act 2002' },
    { key: 'bankBranch', name: 'Bank branch location', sourceRule: 'Section 19(1), RDDBFI Act 1993' },
    { key: 'defendantAddress', name: 'Defendant address location', sourceRule: 'Section 19(1), RDDBFI Act 1993' },
    { key: 'applicantAddress', name: 'Applicant address location', sourceRule: 'Section 19(1), RDDBFI Act 1993' },
  ];

  for (const locSource of locationSources) {
    const locValue = caseInfo[locSource.key];
    if (!locValue || typeof locValue !== 'string' || !locValue.trim()) continue;

    const locUpper = locValue.trim().toUpperCase();

    // Evaluate against each DRT entry in the master database
    for (const drt of drts) {
      if (!drt || !drt.drtName) continue;

      let matchedLocation = null;

      // 1. Check districts
      if (Array.isArray(drt.districts)) {
        for (const dist of drt.districts) {
          if (dist && locUpper.includes(dist.trim().toUpperCase())) {
            matchedLocation = dist.trim();
            break;
          }
        }
      }

      // 2. Check DRT location/city
      if (!matchedLocation && drt.location) {
        if (locUpper.includes(drt.location.trim().toUpperCase())) {
          matchedLocation = drt.location.trim();
        }
      }

      // 3. Check State/UT if specific
      if (!matchedLocation && drt.stateUt) {
        if (locUpper.includes(drt.stateUt.trim().toUpperCase())) {
          matchedLocation = drt.stateUt.trim();
        }
      }

      if (matchedLocation) {
        return {
          possibleDRT: drt.drtName,
          matchingLocation: matchedLocation,
          reason: `${locSource.name} ('${matchedLocation}') matches territorial jurisdiction of ${drt.drtName}`,
          ruleSource: drt.source || drt.jurisdictionDetails || locSource.sourceRule,
          manualVerificationRequired: false,
        };
      }
    }
  }

  return fallbackResult;
};

module.exports = {
  getJurisdictionData,
  reloadJurisdictionData,
  getAllDrts,
  getDrtByName,
  getDrtsByState,
  getDrtByDistrict,
  determineJurisdiction,
};

