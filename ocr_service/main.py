# import os
# import tempfile
# import uvicorn
# from fastapi import FastAPI, UploadFile, File, HTTPException
# from fastapi.middleware.cors import CORSMiddleware

# # Initialize PaddleOCR engine for Hindi ('hi')
# try:
#     from paddleocr import PaddleOCR
#     ocr_engine = PaddleOCR(use_angle_cls=True, lang='hi', show_log=False)
# except Exception as e:
#     print(f"PaddleOCR Engine initialization warning: {e}")
#     ocr_engine = None

# app = FastAPI(title="Hindi Handwriting PaddleOCR Microservice")

# # Enable CORS
# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=["*"],
#     allow_credentials=True,
#     allow_methods=["*"],
#     allow_headers=["*"],
# )

# @app.get("/")
# def health_check():
#     return {
#         "success": True,
#         "message": "Hindi PaddleOCR Microservice is active."
#     }

# @app.post("/ocr")
# async def extract_hindi_text(image: UploadFile = File(...)):
#     """
#     Accept an uploaded image, process with PaddleOCR (Hindi), and return JSON response.
#     Expected JSON:
#     {
#       "success": true,
#       "ocrText": "..."
#     }
#     """
#     temp_file_path = None
#     try:
#         file_bytes = await image.read()
#         if not file_bytes:
#             raise HTTPException(status_code=400, detail="Uploaded image file is empty.")

#         ext = os.path.splitext(image.filename)[1] if image.filename else ".png"
#         if not ext:
#             ext = ".png"

#         # Save temporarily for PaddleOCR
#         with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as temp_file:
#             temp_file.write(file_bytes)
#             temp_file_path = temp_file.name

#         if ocr_engine is None:
#             raise RuntimeError("PaddleOCR engine is not loaded on python service.")

#         # Run PaddleOCR analysis
#         results = ocr_engine.ocr(temp_file_path, cls=True)

#         extracted_lines = []
#         if results and results[0]:
#             for line in results[0]:
#                 if line and len(line) >= 2:
#                     text_str = line[1][0]
#                     if text_str:
#                         extracted_lines.append(text_str.strip())

#         ocr_text = " ".join(extracted_lines)

#         return {
#             "success": True,
#             "ocrText": ocr_text
#         }

#     except Exception as err:
#         return {
#             "success": False,
#             "ocrText": "",
#             "error": str(err)
#         }
#     finally:
#         if temp_file_path and os.path.exists(temp_file_path):
#             try:
#                 os.remove(temp_file_path)
#             except Exception:
#                 pass

# if __name__ == "__main__":
#     uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

import os
import tempfile
import json
import uvicorn
import fitz
import pymupdf

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware


# Disable oneDNN if needed
os.environ["FLAGS_use_mkldnn"] = "0"


# Initialize PaddleOCR
try:
    from paddleocr import PaddleOCR

    ocr_engine = PaddleOCR(
        lang="en",
        use_textline_orientation=True
    )

    print("PaddleOCR initialized successfully")

except Exception as e:
    print(f"PaddleOCR initialization error: {e}")
    ocr_engine = None



app = FastAPI(
    title="Hindi Handwriting PaddleOCR Microservice"
)


# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)



@app.get("/")
def health_check():

    return {
        "success": True,
        "message": "Hindi PaddleOCR Microservice is active."
    }



@app.post("/ocr")
async def extract_hindi_text(
    pdf: UploadFile = File(...)
):

    temp_file_path = None

    try:

        file_bytes = await pdf.read()

        if not file_bytes:
            raise HTTPException(
                status_code=400,
                detail="Uploaded PDF file is empty."
            )

        # ---------------------------------------
        # Create temporary PDF
        # ---------------------------------------

        with tempfile.NamedTemporaryFile(
            delete=False,
            suffix=".pdf"
        ) as temp_file:

            temp_file.write(file_bytes)
            temp_file_path = temp_file.name

        print(f"Temporary PDF created: {temp_file_path}")

        # ---------------------------------------
        # Check OCR engine
        # ---------------------------------------

        if ocr_engine is None:
            raise Exception("OCR engine not loaded")

        # ---------------------------------------
        # Open PDF
        # ---------------------------------------

        extracted_lines = []

        with pymupdf.open(temp_file_path) as doc:

            num_pages = len(doc)

            if num_pages == 0:
                raise Exception(
                    "Uploaded file is not a valid PDF or has 0 pages."
                )

            print(f"PDF contains {num_pages} pages")

            # ---------------------------------------
            # Process every page
            # ---------------------------------------

            for i in range(num_pages):

                print(f"Processing page {i + 1}/{num_pages}")

                page = doc.load_page(i)

                # Render PDF page
                pix = page.get_pixmap(
                    dpi=600,
                    alpha=False
                )

                temp_page_path = None

                try:

                    # ---------------------------------------
                    # Create temporary PNG
                    # ---------------------------------------

                    with tempfile.NamedTemporaryFile(
                        delete=False,
                        suffix=".png"
                    ) as temp_page_img:

                        temp_page_path = temp_page_img.name

                    pix.save(temp_page_path)

                    print(
                        f"Running OCR on page {i + 1}"
                    )

                    # ---------------------------------------
                    # PaddleOCR
                    # ---------------------------------------

                    results = ocr_engine.ocr(
                        temp_page_path,
                        cls=True
                    )

                    page_lines = []

                    if results and results[0]:

                        for line in results[0]:

                            text = line[1][0]

                            if text:

                                page_lines.append(
                                    text.strip()
                                )

                    page_text = " ".join(
                        page_lines
                    )

                    extracted_lines.append(
                        f"--- Page {i + 1} ---\n{page_text}"
                    )

                    print(
                        f"Page {i + 1} OCR completed"
                    )

                finally:

                    # ---------------------------------------
                    # Delete temporary PNG
                    # ---------------------------------------

                    if (
                        temp_page_path
                        and os.path.exists(temp_page_path)
                    ):

                        try:

                            os.remove(
                                temp_page_path
                            )

                        except PermissionError:

                            print(
                                f"Could not delete temporary image: "
                                f"{temp_page_path}"
                            )

        # ---------------------------------------
        # IMPORTANT:
        # PDF is now CLOSED
        # ---------------------------------------

        ocr_text = "\n\n".join(
            extracted_lines
        )

        print("OCR processing completed")

        return {
            "success": True,
            "ocrText": ocr_text,
            "numPages": num_pages
        }

    except HTTPException:
        raise

    except Exception as err:

        print(
            f"OCR ERROR: {str(err)}"
        )

        return {
            "success": False,
            "ocrText": "",
            "numPages": 0,
            "error": str(err)
        }

    finally:

        # ---------------------------------------
        # Delete temporary PDF
        # ---------------------------------------

        if (
            temp_file_path
            and os.path.exists(temp_file_path)
        ):

            try:

                os.remove(
                    temp_file_path
                )

                print(
                    "Temporary PDF deleted"
                )

            except PermissionError:

                print(
                    f"Could not delete temporary PDF: "
                    f"{temp_file_path}"
                )


if __name__ == "__main__":

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )