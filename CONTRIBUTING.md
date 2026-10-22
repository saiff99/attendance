# 🤝 Contributing to MedAttend AI

Thank you for your interest in contributing to **MedAttend AI**! We welcome contributions from developers, researchers, and educators working to improve academic attendance automation, computer vision efficiency, and institutional governance.

---

## 📑 Table of Contents

1. [Code of Conduct](#code-of-conduct)
2. [How Can I Contribute?](#how-can-i-contribute)
3. [Local Development Environment Setup](#local-development-environment-setup)
4. [Branching & Git Workflow](#branching--git-workflow)
5. [Commit Message Conventions](#commit-message-conventions)
6. [Testing & Quality Assurance](#testing--quality-assurance)
7. [Submitting a Pull Request (PR)](#submitting-a-pull-request-pr)

---

## Code of Conduct

We are committed to providing a welcoming, inclusive, and professional environment for all contributors. Please be respectful, constructive, and considerate in all issues, pull requests, and discussions.

---

## How Can I Contribute?

- **Reporting Bugs**: Check the [GitHub Issues](https://github.com/saiff99/attendance/issues) page to verify if the issue has already been reported. If not, open a new issue with reproducible steps, expected vs. actual behavior, and environment details (Node version, Python version, OS).
- **Suggesting Features**: Propose feature ideas with clear institutional use cases (e.g., student experience, CCTV performance, reporting compliance).
- **Submitting Code**: Fix bugs, improve documentation, enhance UI accessibility, or optimize AI inference latency.

---

## Local Development Environment Setup

### 1. Prerequisites
- **Node.js**: `v20.x` or `v22 LTS`
- **Python**: `v3.10` or `v3.11`
- **Git**
- **C++ Build Tools** (For InsightFace/ONNX compilation)

### 2. Repository Setup
```bash
# Clone the repository
git clone https://github.com/saiff99/attendance.git
cd attendance

# Frontend Setup
cd frontend
npm install

# Backend Setup
cd ../backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 3. Environment Variables
Copy `.env.example` to `.env` in the root directory and configure your Supabase, RTSP, and Meta WhatsApp credentials:
```bash
cp .env.example .env
```

### 4. Running the Development Servers
```bash
# In terminal 1 (FastAPI Backend):
cd backend
source venv/bin/activate
uvicorn main:app --reload --port 8000

# In terminal 2 (Next.js Frontend):
cd frontend
npm run dev
```
Alternatively, run the automated unified production runner:
```bash
./start.sh
```

---

## Branching & Git Workflow

1. Fork the repository on GitHub.
2. Create a descriptive feature branch from `main`:
   ```bash
   git checkout -b feat/your-feature-name
   # or for bug fixes:
   git checkout -b fix/issue-description
   ```
3. Keep commits atomic, well-tested, and focused on a single change.

---

## Commit Message Conventions

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

- `feat:` A new feature for the user or system.
- `fix:` A bug fix.
- `docs:` Documentation-only changes.
- `perf:` A code change that improves performance or latency.
- `refactor:` A code change that neither fixes a bug nor adds a feature.
- `test:` Adding or updating tests.
- `chore:` Maintenance tasks, dependency updates, or build script tweaks.

**Example**:
```text
feat(rbac): add bulletproof lockout guardrails for super admin accounts
```

---

## Testing & Quality Assurance

Before opening a pull request, ensure all linters and builds pass cleanly:

### Frontend Validation:
```bash
cd frontend
npm run lint
npm run build
```
Ensure there are no TypeScript compiler errors or unhandled warnings.

### Automated Test Suite:
Run the repository test suite:
```bash
python3 test_attendance_flow.py
```

---

## Submitting a Pull Request (PR)

1. Push your branch to your GitHub fork:
   ```bash
   git push origin feat/your-feature-name
   ```
2. Navigate to the GitHub repository and click **New Pull Request**.
3. Fill out the PR template:
   - Provide a concise summary of the changes.
   - Reference any relevant Issue numbers (e.g., `Closes #12`).
   - Include before/after screenshots for any UI changes.
4. Maintainers will review your PR and provide constructive feedback.

---

*Thank you for helping make MedAttend AI more powerful, reliable, and accessible!*
