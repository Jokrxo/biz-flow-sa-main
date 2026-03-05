# GitHub Token Setup for Teammates

## Option 1: Personal Access Token (PAT) - Recommended for personal account

### Step 1: Create a Personal Access Token
1. Go to: https://github.com/settings/tokens
2. Click **"Generate new token (classic)"**
3. Give it a name (e.g., "BizFlow Dev")
4. Select scopes:
   - ✅ **`repo`** - Full control of private repositories
   - ✅ **`workflow`** - Update GitHub Actions workflows
5. Click **"Generate token"**
6. **Copy the token** (it will only be shown once!)

### Step 2: Configure Git on Teammate's Machine

```bash
# Configure Git with your email/name
git config --global user.email "teammate@example.com"
git config --global user.name "Teammate Name"

# Store credentials (Windows)
git config --global credential.helper store

# Or use Git Credential Manager
git config --global credential.helper manager
```

### Step 3: Clone and Push

```bash
# Clone the repository
git clone https://github.com/Jokrxo/biz-flow-sa-main.git
cd biz-flow-sa-main

# Make changes, commit, then push
git add .
git commit -m "Your changes"
git push origin main
# Username: Jokrxo
# Password: [paste the PAT token here]
```

---

## Option 2: Deploy Token - For service accounts

If using a service account (like a company GitHub org):

1. Go to Organization Settings → Security → Personal access tokens
2. Create a new token with `repo` scope
3. Share with teammate

---

## Option 3: GitHub CLI (Easiest)

```bash
# Install GitHub CLI
winget install GitHub.cli

# Login
gh auth login
# Select: GitHub.com
# Select: HTTPS
# Select: Login with a web browser
# Copy one-time code and paste in browser

# Now push works normally
git push origin main
```

---

## Troubleshooting

### "Permission denied (publickey)" error
```bash
# Use HTTPS instead of SSH
git remote set-url origin https://github.com/Jokrxo/biz-flow-sa-main.git
```

### Token not working?
- Check token hasn't expired
- Verify token has `repo` scope
- Make sure teammate is added to the repository:
  - Go to: https://github.com/Jokrxo/biz-flow-sa-main/settings/collaboration
  - Click "Add collaborator"

### Adding teammate as collaborator:
1. Go to Repository Settings → Collaborators
2. Click "Add people"
3. Enter teammate's GitHub username/email
4. Send invitation

---

## Quick Setup for Teammate

```bash
# 1. Clone
git clone https://github.com/Jokrxo/biz-flow-sa-main.git

# 2. Configure git
git config user.name "Teammate Name"
git config user.email "teammate@email.com"

# 3. Set remote (if needed)
git remote add origin https://github.com/Jokrxo/biz-flow-sa-main.git

# 4. First push (will prompt for credentials)
git push -u origin main
```

---

## Security Notes

⚠️ **Never commit tokens to Git!** Add to `.gitignore`:
```
.env
*.local
token.txt
github_token.txt
```

If a token is accidentally committed:
1. Revoke it immediately at https://github.com/settings/tokens
2. Generate a new one
3. Rotate any other credentials that may have been exposed
