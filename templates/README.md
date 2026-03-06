# POS Integration Templates

This folder contains templates and guides for setting up POS integration with clients.

---

## Files in This Folder

### Client Instructions
- **`client-instruction-square.md`** - Email template for Square clients
- **`client-instruction-toast.md`** - Email template for Toast clients
- **`client-instruction-clover.md`** - Email template for Clover clients

### Setup Guides
- **`setup-checklist.md`** - Complete checklist for each client setup
- **`google-sheet-setup-guide.md`** - How to set up Google Sheet template
- **`railway-variables-template.txt`** - Railway environment variables template

---

## Quick Start

### One-Time Setup (30 minutes)

1. **Set up Google Sheet template:**
   - Follow `google-sheet-setup-guide.md`
   - Add columns F, G, H for POS Item IDs
   - Add status helper column (optional)

2. **Save templates:**
   - All templates are ready to use
   - Personalize with your name/contact info

3. **Test the process:**
   - Use `setup-checklist.md` for your first client
   - Refine process as needed

---

## Per-Client Workflow

### Step 1: Copy Sheet Template
- Copy your Google Sheet template
- Share with client (Editor access)
- Send link to client

### Step 2: Send Client Instructions
- Choose appropriate instruction file (Square/Toast/Clover)
- Personalize with client name
- Attach Google Sheet link
- Send email

### Step 3: Wait for Client
- Client gets credentials (5 min)
- Client fills Item IDs (10 min)
- Total: 15 minutes client work

### Step 4: Configure Railway
- Use `railway-variables-template.txt`
- Copy relevant section
- Fill in client credentials
- Add to Railway Variables

### Step 5: Test
- Make test call
- Place test order
- Verify in client's POS dashboard

---

## Time Estimates

**Your Time Per Client:**
- Square: 7 minutes
- Toast: 7 minutes
- Clover: 17 minutes (includes app creation)

**Client Time Per Client:**
- All systems: 15 minutes

**Wait Times:**
- Square: None
- Toast: 1-3 days (API approval)
- Clover: 1-2 days (app authorization)

---

## Tips for Efficiency

1. **Batch similar clients:**
   - Set up all Square clients together
   - Set up all Toast clients together

2. **Use templates:**
   - Don't recreate instructions each time
   - Copy-paste from templates

3. **Track clients:**
   - Keep a spreadsheet of all clients
   - Track POS system, status, dates

4. **Automate what you can:**
   - Google Sheet formulas help clients
   - Status column shows what's missing

---

## Support

If clients get stuck:
- Offer to help via email
- Quick video call if needed
- Share screenshots showing exact steps

---

## Next Steps

1. Set up your Google Sheet template (follow `google-sheet-setup-guide.md`)
2. Personalize client instruction templates
3. Use `setup-checklist.md` for your first client
4. Refine process based on experience

Good luck! 🚀

