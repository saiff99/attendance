import os
import gradio as gr
import uvicorn
from main import app as fastapi_app

# Gradio Status Dashboard (renders directly in Hugging Face Space App tab)
with gr.Blocks(title="MedAttend AI Engine") as demo:
    gr.Markdown("# 🎓 MedAttend AI — Biometric Vision Engine")
    gr.Markdown("🟢 **Server Status:** Online & Operational on Hugging Face Cloud")
    gr.Markdown("ArcFace 512D facial recognition, liveness detection, and zero-trust attendance engine.")
    gr.Markdown("---")
    gr.Markdown("### 📡 Active API Endpoints:")
    gr.Markdown("- `GET /health` — Health check & system diagnostics")
    gr.Markdown("- `POST /api/enroll-face-burst/{id}` — 5-frame facial biometric enrollment")
    gr.Markdown("- `POST /api/selfie-attendance` — GPS geofenced mobile selfie verification")
    gr.Markdown("- `POST /api/process-attendance` — Classroom CCTV batch recognition")

# Mount Gradio onto the existing FastAPI application
# FastAPI routes remain fully functional at /api/... and /health
app = gr.mount_gradio_app(fastapi_app, demo, path="/")

if __name__ == "__main__":
    port = int(os.getenv("PORT", 7860))
    uvicorn.run(app, host="0.0.0.0", port=port)
