Welcome back! Every time you turn on your MacBook, you just need to start the backend and the tunnel to bring the whole AI system back online.
Here is your exact step-by-step startup guide:

### Terminal 1: Start the AI Camera Engine
Open a terminal and run these commands to start the Python backend:
```
cd /Users/saif/Desktop/Attendance/Attendance-app/backend
```
```
source .venv/bin/activate
```
```
uvicorn main:app --reload
```
*(Leave this running. It connects to the cameras and processes the faces!)*

### Terminal 2: Start the Cloud Tunnel
Open a **second** terminal tab and run your permanent Ngrok tunnel:
```
ngrok http --url=bonfire-frosting-exclaim.ngrok-free.dev 8000
```
*(Leave this running. This securely connects your laptop to the internet without changing your URL!)*

**🎉 That's it for the Live App!**
Because you have a permanent Ngrok domain, you **NO LONGER** need to update Vercel. You can immediately open your Vercel link on your phone, and it will say "System Online".

---

### Terminal 3 (Optional): Run Frontend Locally
If you want to make edits to the website and test them on your laptop before pushing to Vercel, open a **third** terminal and run:
```
cd /Users/saif/Desktop/Attendance/Attendance-app/frontend
```
```
npm run dev
```
Then open your browser and go to `http://localhost:3000`.