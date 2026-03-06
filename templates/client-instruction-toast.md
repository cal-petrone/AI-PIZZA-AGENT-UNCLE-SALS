# POS Integration Setup - Toast Client Instructions

**Subject:** POS Integration Setup - [Client Name]

---

Hi [Client Name],

I'm setting up your phone ordering system to connect directly to your Toast POS. This will make orders appear automatically in your Toast dashboard - no manual entry needed!

I need 2 things from you (takes ~15 minutes + 1-3 day wait for API approval):

---

## 1. Toast API Access (1-3 days wait + 5 minutes)

### Step 1: Request API Access
1. Log into your Toast Dashboard
2. Go to **Settings** → **Integrations** → **API Access**
3. Click **"Request API Access"**
4. Fill out the request form
5. Submit and wait for Toast approval (usually 1-3 business days)

### Step 2: Get API Credentials (After Approval)
Once Toast approves your request:
1. Go back to **Settings** → **Integrations** → **API Access**
2. Copy your **API Key**
3. Copy your **Restaurant ID**
4. Send both to me

**Note:** Toast requires approval before you can use their API. This is a one-time process.

---

## 2. Menu Item IDs (10 minutes)

I've shared a Google Sheet with you. Here's what to do:

### Step 1: Open the Google Sheet
- Check your email for the shared sheet: "[Client Name] Menu"
- Open it → Go to **Menu_Items** tab

### Step 2: Get Item IDs from Toast
1. In Toast Dashboard, click **Menu** (left menu)
2. Click **Items** tab
3. You'll see a list of all your menu items

### Step 3: Copy & Paste Item IDs
For each item in your menu:
1. Find the item in Toast Menu Items
2. Copy the **Menu Item ID** (visible in the item details)
3. Go to Google Sheet → Find the same item
4. Paste the Item ID into **Column G** (Toast Item ID)

**Example:**
```
Toast Menu Items:
┌──────────────────────┬──────────────┐
│ Item Name            │ Menu Item ID │
├──────────────────────┼──────────────┤
│ Large Pepperoni      │ 12345        │ ← Copy this
│ Small Cheese         │ 67890        │ ← Copy this
└──────────────────────┴──────────────┘

Google Sheet:
┌──────────────────────┬──────────────┐
│ Item                 │ Toast Item   │
│                      │ ID           │
├──────────────────────┼──────────────┤
│ Large Pepperoni      │ 12345        │ ← Paste here
│ Small Cheese         │ 67890        │ ← Paste here
└──────────────────────┴──────────────┘
```

**Tip:** The Google Sheet has a "Status" column that shows ✓ when an Item ID is filled, or ⚠ if it's missing.

---

## Timeline

1. **Day 1:** Request Toast API access (5 minutes)
2. **Day 1-3:** Wait for Toast approval
3. **After Approval:** Get API credentials (5 minutes)
4. **After Approval:** Fill in Item IDs (10 minutes)

**Total Active Work:** ~20 minutes
**Total Time:** 1-3 days (mostly waiting)

---

## That's It!

Once you've:
- ✅ Requested API access (waiting for approval)
- ✅ Sent me the API Key and Restaurant ID (after approval)
- ✅ Filled in all Item IDs in the Google Sheet

I'll configure everything and test it. You'll see a test order appear in your Toast dashboard to confirm it's working!

**Questions?** Just reply to this email or give me a call.

Thanks,
[Your Name]

