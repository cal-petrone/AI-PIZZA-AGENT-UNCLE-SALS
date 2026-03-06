# Google Sheet Setup Guide

This guide shows you how to set up the Google Sheet template with POS Item ID columns and helper formulas.

---

## Step 1: Add POS Item ID Columns (5 minutes)

### Click-by-Click Instructions:

1. **Open your Google Sheet**
   - Go to: https://docs.google.com/spreadsheets/
   - Open your menu sheet (or create new one)
   - Go to **Menu_Items** tab

2. **Add Column F Header:**
   - Click on **Column F** header (the "F" at the top)
   - Type: `Square Item ID`
   - Press Enter

3. **Add Column G Header:**
   - Click on **Column G** header
   - Type: `Toast Item ID`
   - Press Enter

4. **Add Column H Header:**
   - Click on **Column H** header
   - Type: `Clover Item ID`
   - Press Enter

5. **Format Headers:**
   - Select **Row 1** (click the "1" on the left)
   - Click **Bold** button (or Ctrl+B / Cmd+B)
   - Click **Fill color** → Choose light gray
   - Headers are now formatted

**Result:** Your sheet now has columns for POS Item IDs

---

## Step 2: Add Status Helper Column (Optional - 2 minutes)

This helps clients see which items still need Item IDs.

### Add Column I Header:
1. Click on **Column I** header
2. Type: `Status`
3. Press Enter

### Add Formula:
1. Click on cell **I2** (first data row, below headers)
2. Type this formula:
   ```
   =IF(F2<>"", "✓ Square", IF(G2<>"", "✓ Toast", IF(H2<>"", "✓ Clover", "⚠ Need ID")))
   ```
3. Press Enter

### Fill Formula Down:
1. Click on cell **I2** (with the formula)
2. Hover over the bottom-right corner until you see a small blue square
3. Double-click the blue square (or drag down to last row)
4. Formula will fill all rows automatically

**What it does:**
- Shows "✓ Square" if Square Item ID is filled
- Shows "✓ Toast" if Toast Item ID is filled
- Shows "✓ Clover" if Clover Item ID is filled
- Shows "⚠ Need ID" if none are filled

**Result:** Clients can quickly see which items need Item IDs

---

## Step 3: Create Template (2 minutes)

Once your sheet is set up:

1. **Right-click the sheet tab** (Menu_Items)
2. Click **"Duplicate"** (or "Copy")
3. Rename the copy: **"Template - Menu with POS Columns"**
4. Clear all data rows (keep headers and formulas)
5. Save

**Result:** You have a reusable template for all future clients

---

## Step 4: Copy Template for Each Client (1 minute per client)

When onboarding a new client:

1. **Open your template sheet**
2. **Right-click the sheet tab**
3. Click **"Copy to"** → **"New spreadsheet"**
4. Rename: **"[Client Name] Menu"**
5. **Share with client:**
   - Click **"Share"** button (top right)
   - Add client's email
   - Set permission: **"Editor"**
   - Click **"Send"**

**Result:** Client has their own copy with POS columns ready

---

## Visual: Sheet Structure

```
Menu_Items Tab:
┌──────┬──────────────┬──────┬───────┬─────────────┬──────────────┬─────────────┬──────────────┬────────┐
│ Cat  │ Item         │ Stock│ Price│ Description │ Square Item  │ Toast Item  │ Clover Item  │ Status │
│      │              │      │      │             │ ID           │ ID          │ ID           │        │
├──────┼──────────────┼──────┼───────┼─────────────┼──────────────┼─────────────┼──────────────┼────────┤
│ Pizza│ Large Pepper │ YES  │ 20.99│ ...         │ ABC123XYZ   │ 12345       │ ITEM_789     │ ✓      │
│ Pizza│ Small Cheese │ YES  │ 14.99│ ...         │ DEF456UVW   │ 67890       │ ITEM_101     │ ✓      │
│ Wings│ Regular      │ YES  │ 12.99│ ...         │              │             │              │ ⚠      │
└──────┴──────────────┴──────┴───────┴─────────────┴──────────────┴─────────────┴──────────────┴────────┘
  A      B             C      D      E            F              G            H              I
```

---

## Tips

1. **Freeze Header Row:**
   - Select Row 1
   - View → Freeze → 1 row
   - Headers stay visible when scrolling

2. **Color Code Status:**
   - Select Column I
   - Format → Conditional formatting
   - If cell = "✓" → Green background
   - If cell = "⚠" → Yellow background

3. **Protect Formulas:**
   - Select Column I
   - Right-click → Protect range
   - Prevents clients from accidentally deleting formulas

---

## Quick Reference

**Columns:**
- A: Category
- B: Item Name
- C: IN STOCK
- D: Price
- E: Description
- F: Square Item ID (NEW)
- G: Toast Item ID (NEW)
- H: Clover Item ID (NEW)
- I: Status (helper column, optional)

**Formula for Status (Column I):**
```
=IF(F2<>"", "✓ Square", IF(G2<>"", "✓ Toast", IF(H2<>"", "✓ Clover", "⚠ Need ID")))
```

