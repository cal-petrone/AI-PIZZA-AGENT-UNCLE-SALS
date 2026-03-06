# POS Integration Setup - Square Client Instructions

**Subject:** POS Integration Setup - [Client Name]

---

Hi [Client Name],

I'm setting up your phone ordering system to connect directly to your Square POS. This will make orders appear automatically in your Square dashboard - no manual entry needed!

I need 2 things from you (takes ~15 minutes total):

---

## 1. Square API Credentials (5 minutes)

### Step 1: Get Access Token
1. Log into your Square Dashboard: https://squareup.com/dashboard
2. Click **Settings** (gear icon, top right)
3. Click **Apps** → **API** → **OAuth Apps**
4. Find your app (or create one if needed)
5. Copy the **Access Token** (Production)
6. Send it to me

### Step 2: Get Location ID
1. In Square Dashboard, click **Locations** (left menu)
2. Click on your main location
3. Copy the **Location ID** (usually starts with "L")
4. Send it to me

**Visual Guide:**
```
Square Dashboard → Settings → Apps → API
┌─────────────────────────────────────┐
│ OAuth Apps                          │
├─────────────────────────────────────┤
│ Application Name                    │
│ Access Token: EAAA...xyz           │ ← Copy this
└─────────────────────────────────────┘

Square Dashboard → Locations
┌─────────────────────────────────────┐
│ Main Location                        │
│ Location ID: LABCD1234              │ ← Copy this
└─────────────────────────────────────┘
```

---

## 2. Menu Item IDs (10 minutes)

I've shared a Google Sheet with you. Here's what to do:

### Step 1: Open the Google Sheet
- Check your email for the shared sheet: "[Client Name] Menu"
- Open it → Go to **Menu_Items** tab

### Step 2: Get Item IDs from Square
1. In Square Dashboard, click **Items** (left menu)
2. Click **Catalog** tab
3. You'll see a list of all your items

### Step 3: Copy & Paste Item IDs
For each item in your menu:
1. Find the item in Square Catalog
2. Copy the **Item ID** (visible in the list)
3. Go to Google Sheet → Find the same item
4. Paste the Item ID into **Column F** (Square Item ID)

**Example:**
```
Square Catalog:
┌──────────────────────┬──────────────┐
│ Item Name            │ Item ID      │
├──────────────────────┼──────────────┤
│ Large Pepperoni      │ ABC123XYZ   │ ← Copy this
│ Small Cheese         │ DEF456UVW   │ ← Copy this
└──────────────────────┴──────────────┘

Google Sheet:
┌──────────────────────┬──────────────┐
│ Item                 │ Square Item  │
│                      │ ID           │
├──────────────────────┼──────────────┤
│ Large Pepperoni      │ ABC123XYZ   │ ← Paste here
│ Small Cheese         │ DEF456UVW   │ ← Paste here
└──────────────────────┴──────────────┘
```

**Tip:** The Google Sheet has a "Status" column that shows ✓ when an Item ID is filled, or ⚠ if it's missing.

---

## That's It!

Once you've:
- ✅ Sent me the Access Token and Location ID
- ✅ Filled in all Item IDs in the Google Sheet

I'll configure everything and test it. You'll see a test order appear in your Square dashboard to confirm it's working!

**Questions?** Just reply to this email or give me a call.

Thanks,
[Your Name]

---

**Timeline:** Usually takes 15-20 minutes. Once complete, orders will appear in Square automatically!

