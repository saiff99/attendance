Welcome back! Every time you turn on your MacBook, you just need to start two terminals to bring the whole AI system back online.
Here is your exact step-by-step startup guide:

- Terminal 1

Start the AI Camera Engine
Open VS Code and open a new terminal.
Move to the backend folder by pasting this
```
cd /Users/saif/Desktop/Attendance/Attendance-app/backend
```

Activate your Python environment:
```
source .venv/bin/activate
```

Start the AI engine:
```
uvicorn main:app --reload
```
(Leave this running. It connects to the Dahua camera and processes the faces!)

- Terminal 2:

Start the Cloud Tunnel

Click the + icon in the terminal panel to open a second terminal tab.

Move to the backend folder again:
```
cd /Users/saif/Desktop/Attendance/Attendance-app/backend
```
Start the Cloudflare Tunnel to broadcast to the internet:
```
npx cloudflared tunnel --url http://localhost:8000
```
Wait a few seconds for it to generate your new URL. Copy the link that looks like https://generated-new-url.trycloudflare.com.

Step 3: Tell Vercel the New Link
- Because the tunnel gives you a new link every time you restart, you just need to quickly tell your website where to find it:
- Go to your Vercel Dashboard > Settings > Environment Variables.
- Find NEXT_PUBLIC_BACKEND_URL, click the edit (pencil) icon, paste your new Cloudflare link, and hit Save.
- Go to the Deployments tab at the top.
- Click the three dots (...) next to your most recent deployment and click Redeploy.
- Once Vercel finishes building (usually takes 1 minute), your CCTV tracking will be completely live on the internet!

<p align="center">View this image</p>
<div align="center"> <img width="475" height="248" alt="Screenshot 2026-05-10 at 11 58 31 PM" src="https://github.com/user-attachments/assets/817c7e04-70b6-43dd-bd84-09001b57166a" /> </div>


