# POS Integration Setup - Clover Client Instructions

**Subject:** POS Integration Setup - [Client Name]

---

Hi [Client Name],

I'm setting up your phone ordering system to connect directly to your Clover POS. This will make orders appear automatically in your Clover dashboard - no manual entry needed!

I need 2 things from you (takes ~15 minutes + 1-2 day wait for authorization):

---

## 1. Clover App Authorization (1-2 days wait + 5 minutes)

I've created a Clover app for your integration. Now I need you to authorize it:

### Step 1: Authorize the App
1. Log into your Clover Dashboard
2. Go to **Settings** → **Apps**
3. Find the app: "[Your App Name]" (or similar)
4. Click **"Authorize"** or **"Grant Access"**
5. Grant the following permissions:
   - ✅ Orders (create orders)
   - ✅ Items (read menu items)
   - ✅ Customers (create customer records)
6. Click **"Authorize"**

### Step 2: Get API Credentials (After Authorization)
Once you've authorized the app:
1. In Clover Dashboard, go to **Settings** → **API**
2. Copy your **Merchant ID**
3. Copy your **API Token**
4. Send both to me

**Note:** Clover requires app authorization before you can use their API. This is a one-time process.

---

## 2. Menu Item IDs (10 minutes)

I've shared a Google Sheet with you. Here's what to do:

### Step 1: Open the Google Sheet
- Check your email for the shared sheet: "[Client Name] Menu"
- Open it → Go to **Menu_Items** tab

### Step 2: Get Item IDs from Clover
1. In Clover Dashboard, click **Items** (left menu)
2. Click **Menu** tab
3. You'll see a list of all your menu items

### Step 3: Copy & Paste Item IDs
For each item in your menu:
1. Find the item in Clover Menu
2. Click on the item to view details
3. Copy the **Item ID** (visible in the item details)
4. Go to Google Sheet → Find the same item
5. Paste the Item ID into **Column H** (Clover Item ID)

**Example:**
```
Clover Menu Items:
┌──────────────────────┬──────────────┐
│ Item Name            │ Item ID      │
├──────────────────────┼──────────────┤
│ Large Pepperoni      │ ITEM_789     │ ← Copy this
│ Small Cheese         │ ITEM_101     │ ← Copy this
└──────────────────────┴──────────────┘

Google Sheet:
┌──────────────────────┬──────────────┐
│ Item                 │ Clover Item  │
│                      │ ID           │
├──────────────────────┼──────────────┤
│ Large Pepperoni      │ ITEM_789     │ ← Paste here
│ Small Cheese         │ ITEM_101     │ ← Paste here
└──────────────────────┴──────────────┘
```

**Tip:** The Google Sheet has a "Status" column that shows ✓ when an Item ID is filled, or ⚠ if it's missing.

---

## Timeline

1. **Day 1:** Authorize Clover app (5 minutes)
2. **Day 1-2:** Wait for authorization to process
3. **After Authorization:** Get API credentials (5 minutes)
4. **After Authorization:** Fill in Item IDs (10 minutes)

**Total Active Work:** ~20 minutes
**Total Time:** 1-2 days (mostly waiting)

---

## That's It!

Once you've:
- ✅ Authorized the Clover app (waiting for processing)
- ✅ Sent me the Merchant ID and API Token (after authorization)
- ✅ Filled in all Item IDs in the Google Sheet

I'll configure everything and test it. You'll see a test order appear in your Clover dashboard to confirm it's working!

**Questions?** Just reply to this email or give me a call.

Thanks,
[Your Name]

