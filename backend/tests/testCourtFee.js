const { calculateCourtFee } = require('../services/courtFeeService');

let passedTests = 0;
let failedTests = 0;

function assertEqual(actual, expected, testName) {
  if (actual === expected) {
    console.log(`✅ [PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`❌ [FAIL] ${testName}: Expected ${expected}, got ${actual}`);
    failedTests++;
  }
}

console.log("==================================================");
console.log("RUNNING DRT COURT FEE ENGINE UNIT TESTS");
console.log("==================================================\n");

// --- SECTION 19 TESTS ---
console.log("--- Section 19 Recovery of Debt Tests ---");

const sec19_10L = calculateCourtFee({ section: "19", applicantType: "bank", claimAmount: 1000000 });
assertEqual(sec19_10L.calculatedFee, 12000, "Section 19: ₹10,00,000 → ₹12,000");
assertEqual(sec19_10L.manualVerificationRequired, false, "Section 19: ₹10L manual verification false");

const sec19_10_5L = calculateCourtFee({ section: "19", applicantType: "bank", claimAmount: 1050000 });
assertEqual(sec19_10_5L.calculatedFee, 13000, "Section 19: ₹10,50,000 → ₹13,000");

const sec19_11L = calculateCourtFee({ section: "19", applicantType: "bank", claimAmount: 1100000 });
assertEqual(sec19_11L.calculatedFee, 13000, "Section 19: ₹11,00,000 → ₹13,000");

const sec19_11_01L = calculateCourtFee({ section: "19", applicantType: "bank", claimAmount: 1101000 });
assertEqual(sec19_11_01L.calculatedFee, 14000, "Section 19: ₹11,01,000 → ₹14,000");

const sec19_20L = calculateCourtFee({ section: "19", applicantType: "bank", claimAmount: 2000000 });
assertEqual(sec19_20L.calculatedFee, 22000, "Section 19: ₹20,00,000 → ₹22,000");

const sec19_Cap = calculateCourtFee({ section: "19", applicantType: "bank", claimAmount: 20000000 });
assertEqual(sec19_Cap.calculatedFee, 150000, "Section 19: ₹2,00,00,000 → Cap ₹1,50,000");

// --- SECTION 17 (BORROWER) TESTS ---
console.log("\n--- Section 17 (Applicant = Borrower) Tests ---");

const sec17_bor_1L = calculateCourtFee({ section: "17", applicantType: "borrower", claimAmount: 100000 });
assertEqual(sec17_bor_1L.calculatedFee, 500, "Section 17 (Borrower): ₹1,00,000 → ₹500");

const sec17_bor_5L = calculateCourtFee({ section: "17", applicantType: "borrower", claimAmount: 500000 });
assertEqual(sec17_bor_5L.calculatedFee, 2500, "Section 17 (Borrower): ₹5,00,000 → ₹2,500");

const sec17_bor_9_5L = calculateCourtFee({ section: "17", applicantType: "borrower", claimAmount: 950000 });
assertEqual(sec17_bor_9_5L.calculatedFee, 5000, "Section 17 (Borrower): ₹9,50,000 → ₹5,000");

const sec17_bor_10L = calculateCourtFee({ section: "17", applicantType: "borrower", claimAmount: 1000000 });
assertEqual(sec17_bor_10L.calculatedFee, 5000, "Section 17 (Borrower): ₹10,00,000 → ₹5,000");

const sec17_bor_10_5L = calculateCourtFee({ section: "17", applicantType: "borrower", claimAmount: 1050000 });
assertEqual(sec17_bor_10_5L.calculatedFee, 5250, "Section 17 (Borrower): ₹10,50,000 → ₹5,250");

const sec17_bor_11L = calculateCourtFee({ section: "17", applicantType: "borrower", claimAmount: 1100000 });
assertEqual(sec17_bor_11L.calculatedFee, 5250, "Section 17 (Borrower): ₹11,00,000 → ₹5,250");

const sec17_bor_11_01L = calculateCourtFee({ section: "17", applicantType: "borrower", claimAmount: 1101000 });
assertEqual(sec17_bor_11_01L.calculatedFee, 5500, "Section 17 (Borrower): ₹11,01,000 → ₹5,500");

const sec17_bor_Cap = calculateCourtFee({ section: "17", applicantType: "borrower", claimAmount: 50000000 });
assertEqual(sec17_bor_Cap.calculatedFee, 100000, "Section 17 (Borrower): ₹5,00,00,000 → Cap ₹1,00,000");

// --- SECTION 17 (NON-BORROWER / AGGRIEVED PARTY) TESTS ---
console.log("\n--- Section 17 (Applicant = Aggrieved Party / Non-Borrower) Tests ---");

const sec17_nb_5L = calculateCourtFee({ section: "17", applicantType: "aggrieved_party", claimAmount: 500000 });
assertEqual(sec17_nb_5L.calculatedFee, 625, "Section 17 (Non-Borrower): ₹5,00,000 → ₹625");

const sec17_nb_10L = calculateCourtFee({ section: "17", applicantType: "aggrieved_party", claimAmount: 1000000 });
assertEqual(sec17_nb_10L.calculatedFee, 1250, "Section 17 (Non-Borrower): ₹10,00,000 → ₹1,250");

const sec17_nb_10_5L = calculateCourtFee({ section: "17", applicantType: "aggrieved_party", claimAmount: 1050000 });
assertEqual(sec17_nb_10_5L.calculatedFee, 1375, "Section 17 (Non-Borrower): ₹10,50,000 → ₹1,375");

const sec17_nb_11L = calculateCourtFee({ section: "17", applicantType: "aggrieved_party", claimAmount: 1100000 });
assertEqual(sec17_nb_11L.calculatedFee, 1375, "Section 17 (Non-Borrower): ₹11,00,000 → ₹1,375");

const sec17_nb_Cap = calculateCourtFee({ section: "17", applicantType: "aggrieved_party", claimAmount: 50000000 });
assertEqual(sec17_nb_Cap.calculatedFee, 50000, "Section 17 (Non-Borrower): ₹5,00,00,000 → Cap ₹50,000");

// --- MISSING / INCOMPLETE INFO FALLBACK TESTS ---
console.log("\n--- Missing Data & Legal Safety Tests ---");

const missingSec = calculateCourtFee({ applicantType: "borrower", claimAmount: 500000 });
assertEqual(missingSec.manualVerificationRequired, true, "Missing section requires manual verification");
assertEqual(missingSec.calculatedFee, null, "Missing section returns null calculatedFee");

const missingAmount = calculateCourtFee({ section: "19", applicantType: "bank" });
assertEqual(missingAmount.manualVerificationRequired, true, "Missing claim amount requires manual verification");
assertEqual(missingAmount.calculatedFee, null, "Missing claim amount returns null calculatedFee");

const sec17_missingApplicantType = calculateCourtFee({ section: "17", claimAmount: 500000 });
assertEqual(sec17_missingApplicantType.manualVerificationRequired, true, "Section 17 missing applicant type requires manual verification");

console.log("\n==================================================");
console.log(`TEST SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED`);
console.log("==================================================");

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
