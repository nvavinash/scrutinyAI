const fs = require('fs');
const { extractTextFromPdf } = require('../services/ocrService');
const { correctTextWithOllama, extractCaseInfoWithOllama } = require('../services/ollamaService');
const { determineJurisdiction } = require('../services/jurisdictionService');
const { calculateCourtFee } = require('../services/courtFeeService');
const { calculateLimitation } = require('../services/limitationService');

/**
 * Controller for Upload, OCR & LLM Analysis Workflow
 * POST /api/upload
 */
const processUpload = async (req, res, next) => {
  const uploadedFile = req.file;
  try {
    if (!uploadedFile) {
      return res.status(400).json({
        success: false,
        message: 'Missing PDF. Please upload a PDF file.',
      });
    }

    // Extract text via Python PaddleOCR Service
    let ocrText = '';
    let numPages = 1;

    try {
      const ocrResult = await extractTextFromPdf(uploadedFile.path);

      console.log("========== OCR RESULT ==========");
      console.log(ocrResult);
      console.log("================================");

      if (ocrResult && ocrResult.success) {
        ocrText = ocrResult.ocrText || '';
        numPages = ocrResult.numPages || 1;
      }
    } catch (err) {
      console.warn(`[OCR Service Warning] ${err.message}`);
    }

    // Process OCR text with Ollama
    console.log("========== SENDING OCR TO OLLAMA ==========");
    console.log(ocrText);
    console.log("============================================");

    const llmResult = await correctTextWithOllama(ocrText);

    console.log("========== OLLAMA RESULT ==========");
    console.log(llmResult);
    console.log("===================================");

    const correctedText = llmResult.correctedText || ocrText;

    // STEP 5: Extract structured DRT case information from corrected OCR text
    const caseInfo = await extractCaseInfoWithOllama(correctedText);

    // Run deterministic DRT jurisdiction engine
    const jurisdictionResult = determineJurisdiction(caseInfo);

    console.log("========== JURISDICTION RESULT ==========");
    console.log(jurisdictionResult);
    console.log("==========================================");

    // STEP 6: Run deterministic DRT Court Fee Engine
    const courtFeeResult = calculateCourtFee(caseInfo);

    console.log("========== COURT FEE RESULT ==========");
    console.log(courtFeeResult);
    console.log("=======================================");

    // STEP 7: Run deterministic Limitation Scrutiny Engine
    const limitationResult = calculateLimitation(caseInfo);

    console.log("========== LIMITATION RESULT ==========");
    console.log(limitationResult);
    console.log("=======================================");

    const relativePath = `uploads/${uploadedFile.filename}`;

    return res.status(200).json({
      success: true,
      ocrText: ocrText,
      correctedText: correctedText,
      summary: llmResult.summary || '',
      category: llmResult.category || 'Other',
      priority: llmResult.priority || 'Medium',
      keywords: llmResult.keywords || [],
      caseInfo: caseInfo,
      jurisdictionResult: jurisdictionResult,
      courtFeeResult: courtFeeResult,
      limitationResult: limitationResult,
      message: 'PDF processed successfully.',
      filePath: relativePath,
      fileName: uploadedFile.filename,
      numPages: numPages,
    });
  } catch (error) {
    next(error);
  } finally {
    if (uploadedFile && uploadedFile.path) {
      fs.unlink(uploadedFile.path, (err) => {
        if (err) {
          console.error(`[Cleanup Error] Failed to delete temp file ${uploadedFile.path}:`, err.message);
        } else {
          console.log(`[Cleanup] Successfully deleted temp file ${uploadedFile.path}`);
        }
      });
    }
  }
};

module.exports = {
  processUpload,
};
