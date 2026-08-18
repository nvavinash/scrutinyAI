import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { uploadPdf } from '../services/api';
import Spinner from '../components/Spinner';

// Allowed file types and max size (20MB)
const ALLOWED_TYPES = ['application/pdf'];
const MAX_SIZE = 20 * 1024 * 1024; // 20MB in bytes

/**
 * Upload page - Drag & drop or browse PDF upload.
 */
function Upload() {
  const [file, setFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  const fileInputRef = useRef(null);
  const navigate = useNavigate();

  /**
   * Validate and set the selected file.
   */
  const handleFile = useCallback((selectedFile) => {
    setError('');

    const isPdf = selectedFile.type === 'application/pdf' || selectedFile.name.toLowerCase().endsWith('.pdf');

    // Validate file type
    if (!isPdf) {
      setError('Unsupported file type. Please upload a PDF file.');
      return;
    }

    // Validate file size
    if (selectedFile.size > MAX_SIZE) {
      setError('File is too large. Maximum size is 20MB.');
      return;
    }

    setFile(selectedFile);
  }, []);

  /**
   * Handle file input change.
   */
  const handleInputChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) handleFile(selectedFile);
  };

  /**
   * Handle drag over event.
   */
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  /**
   * Handle drag leave event.
   */
  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  /**
   * Handle file drop event.
   */
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) handleFile(droppedFile);
  };

  /**
   * Remove the selected file.
   */
  const handleRemove = () => {
    setFile(null);
    setError('');
    setProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  /**
   * Upload the file to the backend.
   */
  const handleUpload = async () => {
    if (!file) return;

    setIsUploading(true);
    setError('');
    setProgress(0);

    try {
      const result = await uploadPdf(file, (percent) => {
        setProgress(percent);
      });

      // Navigate to result page with full OCR data
      navigate('/result', {
        state: {
          imageUrl: null,
          fileName: file.name,
          numPages: result.numPages || 1,
          ocrText: result.ocrText || '',
          correctedText: result.correctedText || result.ocrText || '',
          summary: result.summary || '',
          category: result.category || 'Other',
          priority: result.priority || 'Medium',
          keywords: result.keywords || [],
          caseInfo: result.caseInfo || null,
          jurisdictionResult: result.jurisdictionResult || null,
          courtFeeResult: result.courtFeeResult || null,
        },
      });
    } catch (err) {
      const message =
        err.response?.data?.message || err.response?.data?.error || err.message || 'Upload failed. Please try again.';
      setError(message);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-xl">
        {/* Page Title */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Upload PDF</h1>
          <p className="text-gray-500">Upload a PDF of Hindi handwriting to extract text</p>
        </div>

        {/* Drop Zone */}
        {!file ? (
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`relative border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all duration-300 ${isDragging
                ? 'border-primary-500 bg-primary-50 scale-[1.02]'
                : 'border-gray-200 bg-white hover:border-primary-300 hover:bg-primary-50/30'
              }`}
          >
            {/* Upload Icon */}
            <div className="mb-4 inline-flex items-center justify-center w-16 h-16 bg-primary-100 rounded-2xl">
              <svg className="w-8 h-8 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>

            <p className="text-gray-700 font-medium mb-1">
              Drag & drop your PDF here
            </p>
            <p className="text-sm text-gray-400 mb-4">or click to browse</p>
            <p className="text-xs text-gray-300">
              Supports PDF — Max 20MB
            </p>

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              onChange={handleInputChange}
              className="hidden"
            />
          </div>
        ) : (
          /* PDF Preview Details */
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden p-6">
            <div className="flex flex-col items-center justify-center p-8 bg-gray-50 rounded-xl border border-gray-100/50 mb-4">
              <svg className="w-16 h-16 text-red-500 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              <p className="text-gray-800 font-semibold text-center break-all">{file.name}</p>
              <p className="text-xs text-gray-400 mt-1 uppercase font-medium tracking-wider bg-gray-200/50 px-2 py-0.5 rounded">
                {file.type || 'application/pdf'}
              </p>
            </div>

            {/* File Info */}
            <div className="p-4 border-t border-gray-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex-shrink-0 w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{file.name}</p>
                    <p className="text-xs text-gray-400">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>

                {/* Remove Button */}
                <button
                  onClick={handleRemove}
                  disabled={isUploading}
                  className="flex-shrink-0 p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all duration-200 disabled:opacity-50"
                  title="Remove PDF"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>

              {/* Progress Bar */}
              {isUploading && (
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-primary-600">Uploading...</span>
                    <span className="text-xs font-medium text-primary-600">{progress}%</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-primary-500 to-primary-400 h-2 rounded-full transition-all duration-300 ease-out"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mt-4 p-4 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3">
            <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Upload Button */}
        {file && (
          <button
            onClick={handleUpload}
            disabled={isUploading}
            className="mt-6 w-full flex items-center justify-center gap-2 px-6 py-4 bg-primary-600 hover:bg-primary-700 disabled:bg-primary-400 text-white font-semibold rounded-xl shadow-lg shadow-primary-600/30 hover:shadow-xl transition-all duration-300 disabled:cursor-not-allowed"
          >
            {isUploading ? (
              <>
                <Spinner size="sm" />
                <span>Processing...</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                <span>Upload & Extract Text</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

export default Upload;
