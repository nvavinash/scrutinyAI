const axios = require('axios');

const parseLlmJson = (responseText, fallbackOcrText) => {
  if (!responseText) {
    return {
      correctedText: fallbackOcrText,
      summary: '',
      category: 'Other',
      priority: 'Medium',
      keywords: [],
    };
  }

  console.log('========== RAW QWEN RESPONSE ==========');
  console.log(responseText);
  console.log('========================================');

  let cleanText = responseText.trim();

  // Remove markdown code fences if Qwen returns them
  cleanText = cleanText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    const parsed = JSON.parse(cleanText);

    console.log('========== PARSED JSON ==========');
    console.dir(parsed, { depth: null });
    console.log('=================================');

    return {
      correctedText: fallbackOcrText,

      summary:
        typeof parsed.summary === 'string'
          ? parsed.summary.trim()
          : '',

      category:
        parsed.category || 'Other',

      priority:
        parsed.priority || 'Medium',

      keywords:
        Array.isArray(parsed.keywords)
          ? parsed.keywords
          : [],
    };

  } catch (error) {

    console.warn(
      '[Ollama JSON Parse Error]',
      error.message
    );

    console.warn(
      '[Ollama Clean Response]',
      cleanText
    );

    // Try extracting JSON from surrounding text
    const start = cleanText.indexOf('{');
    const end = cleanText.lastIndexOf('}');

    if (start !== -1 && end !== -1 && end > start) {

      const jsonString =
        cleanText.substring(start, end + 1);

      try {

        const parsed =
          JSON.parse(jsonString);

        return {
          correctedText: fallbackOcrText,

          summary:
            typeof parsed.summary === 'string'
              ? parsed.summary.trim()
              : '',

          category:
            parsed.category || 'Other',

          priority:
            parsed.priority || 'Medium',

          keywords:
            Array.isArray(parsed.keywords)
              ? parsed.keywords
              : [],
        };

      } catch (secondError) {

        console.warn(
          '[Ollama Embedded JSON Error]',
          secondError.message
        );
      }
    }

    return {
      correctedText: fallbackOcrText,
      summary: '',
      category: 'Other',
      priority: 'Medium',
      keywords: [],
    };
  }
};


const correctTextWithOllama = async (ocrText) => {

  if (!ocrText || !ocrText.trim()) {

    return {
      correctedText: '',
      summary: '',
      category: 'Other',
      priority: 'Low',
      keywords: [],
    };
  }

  const ollamaUrl =
    process.env.OLLAMA_API_URL ||
    'http://localhost:11434/api/generate';

  const modelName =
    process.env.OLLAMA_MODEL ||
    'qwen3:4b';


  const prompt = `
You are a Hindi government document analysis assistant.

The following text was extracted from a document using OCR.

The OCR may contain:
- Hindi spelling mistakes
- missing matras
- broken words
- incorrect characters
- incorrect spaces
- English words
- numbers
- OCR noise

Understand the meaning of the document using the available information.

Do NOT invent information.

If a piece of information is unclear, leave that field empty.

Identify the following information:

1. Applicant name
2. Village
3. Locality, mohalla or ward
4. District
5. State
6. Address
7. Department or authority
8. Main grievance
9. Requested action

Then create a concise Hindi summary.

SUMMARY RULES:

- The summary is mandatory.
- The summary must NEVER be empty.
- Write the summary in Hindi.
- Write approximately 4 to 5 short sentences.
- Include the applicant name if clearly available.
- Include address/location if clearly available.
- Include the department/authority if clearly available.
- Explain the main problem.
- Explain the requested action.
- Do not invent facts.
- Do not reproduce the OCR text.
- Do not explain your reasoning.

If "सेवा में" appears in the document, understand that the text following it may identify the recipient/authority of the application.

Return ONLY a JSON object.

Use exactly this structure:

{
  "applicantName": "",
  "village": "",
  "locality": "",
  "district": "",
  "state": "",
  "address": "",
  "department": "",
  "grievance": "",
  "request": "",
  "summary": ""
}

The summary field MUST contain a Hindi summary.

OCR TEXT:

${ocrText.trim()}
`;


  try {

    console.log(
      '========== CALLING QWEN =========='
    );

    console.log(
      'Model:',
      modelName
    );

    console.log(
      'OCR length:',
      ocrText.length
    );

    console.log(
      '=================================='
    );


    const response = await axios.post(

      ollamaUrl,

      {
        model: modelName,

        prompt: prompt,

        stream: false,

        format: 'json',

        options: {
          temperature: 0.1,
          num_predict: 800,
          top_p: 0.8
        },

        think: false,
      },

      {
        timeout: 180000,
      }
    );


    console.log(
      '========== OLLAMA HTTP RESPONSE =========='
    );

    console.log(
      'Status:',
      response.status
    );

    console.dir(
      response.data,
      { depth: null }
    );

    console.log(
      '=========================================='
    );


    if (
      response.data &&
      response.data.response
    ) {

      const result =
        parseLlmJson(
          response.data.response,
          ocrText.trim()
        );

      console.log(
        '========== FINAL LLM RESULT =========='
      );

      console.dir(
        result,
        { depth: null }
      );

      console.log(
        '======================================'
      );

      return result;
    }


    console.warn(
      '[Ollama] Empty response received'
    );


    return {
      correctedText: ocrText.trim(),
      summary: '',
      category: 'Other',
      priority: 'Medium',
      keywords: [],
    };


  } catch (error) {

    console.error(
      '[Ollama Error]',
      error.message
    );

    if (error.response) {

      console.error(
        'Ollama status:',
        error.response.status
      );

      console.error(
        'Ollama response:',
        error.response.data
      );
    }


    return {
      correctedText: ocrText.trim(),
      summary: '',
      category: 'Other',
      priority: 'Medium',
      keywords: [],
    };
  }
};

/**
 * Sanitize extracted values. If a field cannot be found or contains N/A/empty indicators, return null.
 */
const sanitizeValue = (val) => {
  if (val === null || val === undefined) return null;
  if (typeof val !== 'string') val = String(val);
  const trimmed = val.trim();
  const lower = trimmed.toLowerCase();
  if (
    !trimmed ||
    lower === 'null' ||
    lower === 'n/a' ||
    lower === 'na' ||
    lower === 'not available' ||
    lower === 'not specified' ||
    lower === 'none' ||
    lower === 'unknown' ||
    lower === 'nil' ||
    lower === 'उपलब्ध नहीं' ||
    lower === 'अज्ञात'
  ) {
    return null;
  }
  return trimmed;
};

/**
 * Extract structured DRT case information from corrected OCR text using Ollama LLM.
 * Returns structured JSON containing case fields or null if not found.
 */
const extractCaseInfoWithOllama = async (text) => {
  const emptyCaseInfo = {
    applicantName: null,
    applicantAddress: null,
    defendantName: null,
    defendantAddress: null,
    bankName: null,
    bankBranch: null,
    securedAssetAddress: null,
    caseTypeOrAct: null,
    debtOrClaimAmount: null,
    possessionNoticeDate: null,
    relevantOrderDate: null,
    filingDate: null,
  };

  if (!text || !text.trim()) {
    return emptyCaseInfo;
  }

  const ollamaUrl = process.env.OLLAMA_API_URL || 'http://localhost:11434/api/generate';
  const modelName = process.env.OLLAMA_MODEL || 'qwen3:4b';

  const prompt = `
You are a DRT (Debt Recovery Tribunal) legal scrutiny assistant.
Extract structured case information from the following document text (in Hindi or English).

Extract ONLY these exact fields:
1. Applicant name (आवेदनकर्ता का नाम)
2. Applicant address (आवेदनकर्ता का पता)
3. Defendant name (प्रतिवादी/अनावेदक का नाम)
4. Defendant address (प्रतिवादी का पता)
5. Bank name (बैंक का नाम)
6. Bank branch (बैंक शाखा)
7. Secured asset/property address (बंधक संपत्ति / प्रतिभूत संपत्ति का पता)
8. Case type / Act (मामले का प्रकार / अधिनियम, उदा. SARFAESI Act, RDDBFI Act, Section 17, Section 19, OA, SA, आदि)
9. Debt / claim amount (ऋण / दावे की राशि)
10. Possession notice date (कब्जा नोटिस की तिथि)
11. Relevant order/measure date (संबंधित आदेश / कार्रवाई की तिथि)
12. Filing date, if available (याचिका दाखिला की तिथि)

CRITICAL RULES:
- Return ONLY a valid JSON object matching the requested schema.
- If a field is not found or not explicitly mentioned in the text, set its value to null.
- Do NOT guess missing information or invent details.
- Do NOT make any legal decision.

Return JSON in this format:
{
  "applicantName": null,
  "applicantAddress": null,
  "defendantName": null,
  "defendantAddress": null,
  "bankName": null,
  "bankBranch": null,
  "securedAssetAddress": null,
  "caseTypeOrAct": null,
  "debtOrClaimAmount": null,
  "possessionNoticeDate": null,
  "relevantOrderDate": null,
  "filingDate": null
}

DOCUMENT TEXT:
${text.trim()}
`;

  try {
    console.log('========== EXTRACTING CASE INFO WITH OLLAMA ==========');
    const response = await axios.post(
      ollamaUrl,
      {
        model: modelName,
        prompt: prompt,
        stream: false,
        format: 'json',
        options: {
          temperature: 0.0,
          num_predict: 800,
        },
        think: false,
      },
      {
        timeout: 180000,
      }
    );

    if (response.data && response.data.response) {
      let rawJsonText = response.data.response.trim();
      rawJsonText = rawJsonText
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

      let parsed = null;
      try {
        parsed = JSON.parse(rawJsonText);
      } catch (err) {
        const start = rawJsonText.indexOf('{');
        const end = rawJsonText.lastIndexOf('}');
        if (start !== -1 && end !== -1 && end > start) {
          try {
            parsed = JSON.parse(rawJsonText.substring(start, end + 1));
          } catch (e) {}
        }
      }

      if (parsed) {
        const extracted = {
          applicantName: sanitizeValue(parsed.applicantName),
          applicantAddress: sanitizeValue(parsed.applicantAddress),
          defendantName: sanitizeValue(parsed.defendantName),
          defendantAddress: sanitizeValue(parsed.defendantAddress),
          bankName: sanitizeValue(parsed.bankName),
          bankBranch: sanitizeValue(parsed.bankBranch),
          securedAssetAddress: sanitizeValue(parsed.securedAssetAddress),
          caseTypeOrAct: sanitizeValue(parsed.caseTypeOrAct),
          debtOrClaimAmount: sanitizeValue(parsed.debtOrClaimAmount),
          possessionNoticeDate: sanitizeValue(parsed.possessionNoticeDate),
          relevantOrderDate: sanitizeValue(parsed.relevantOrderDate),
          filingDate: sanitizeValue(parsed.filingDate),
        };
        console.log('========== EXTRACTED CASE INFO ==========');
        console.dir(extracted, { depth: null });
        console.log('==========================================');
        return extracted;
      }
    }
  } catch (error) {
    console.error('[Case Info Extraction Error]', error.message);
  }

  return emptyCaseInfo;
};


module.exports = {
  correctTextWithOllama,
  extractCaseInfoWithOllama,
};