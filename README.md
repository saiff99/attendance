Welcome back! Every time you turn on your MacBook, you just need to start the backend and the tunnel to bring the whole AI system back online.
Here is your exact step-by-step startup guide:

Terminal 1: The Frontend (This runs the website UI)
```
cd frontend
```
```
npm run dev
```
Terminal 2: The AI Backend (This runs the facial recognition engine)
```
cd backend
```
```
source .venv/bin/activate
```
```
uvicorn main:app --reload
```
Terminal 3: The Ngrok Tunnel (This securely exposes your backend so the Vercel mobile app can reach it)
```
ngrok http --url=silly-unframed-extortion.ngrok-free.dev 8000
```

Then open your browser and go `http://localhost:3000`[↗️](http://localhost:3000)
