# POS Integration Setup Checklist

Use this checklist for each new client to ensure nothing is missed.

---

## Pre-Setup (One-Time, Do Once)

- [ ] Create Google Sheet template with POS columns (F, G, H)
- [ ] Add helper formula to Column I (Status indicator)
- [ ] Save client instruction templates
- [ ] Save Railway variables template

---

## Per-Client Setup

### Phase 1: Initial Setup (You - 5 minutes)

- [ ] Copy Google Sheet template
  - [ ] Right-click sheet → "Make a copy"
  - [ ] Rename: "[Client Name] Menu"
  - [ ] Share with client (Editor access)
  - [ ] Send sharing link to client

- [ ] Determine client's POS system
  - [ ] Square
  - [ ] Toast
  - [ ] Clover

- [ ] Send appropriate client instruction email
  - [ ] Square: Use `client-instruction-square.md`
  - [ ] Toast: Use `client-instruction-toast.md`
  - [ ] Clover: Use `client-instruction-clover.md`
  - [ ] Personalize with client name
  - [ ] Attach Google Sheet link

---

### Phase 2: Wait for Client (Client Work)

**For Square:**
- [ ] Client gets Square credentials (5 min)
- [ ] Client fills Item IDs in sheet (10 min)
- **Total: 15 minutes, no wait**

**For Toast:**
- [ ] Client requests Toast API access
- [ ] Wait 1-3 days for Toast approval
- [ ] Client gets Toast credentials (5 min)
- [ ] Client fills Item IDs in sheet (10 min)
- **Total: 15 minutes work + 1-3 day wait**

**For Clover:**
- [ ] You create Clover app (10 min)
- [ ] Client authorizes app
- [ ] Wait 1-2 days for authorization
- [ ] Client gets Clover credentials (5 min)
- [ ] Client fills Item IDs in sheet (10 min)
- **Total: 15 minutes work + 1-2 day wait**

---

### Phase 3: Configuration (You - 2 minutes)

- [ ] Receive credentials from client
- [ ] Add Railway variables:
  - [ ] Open Railway Dashboard
  - [ ] Select project
  - [ ] Go to Variables tab
  - [ ] Add POS_SYSTEM variable
  - [ ] Add POS-specific credentials (from template)
  - [ ] Verify all variables added
- [ ] Wait for Railway deployment (1-2 minutes)

---

### Phase 4: Testing (You - 5 minutes)

- [ ] Make test phone call
- [ ] Place test order with mapped item
- [ ] Verify order appears in client's POS dashboard
- [ ] Check Railway logs for any errors
- [ ] Verify Google Sheets backup logging works
- [ ] Confirm with client that order appeared correctly

---

### Phase 5: Go Live

- [ ] Client confirms test order looks correct
- [ ] Document any issues or missing Item IDs
- [ ] Mark client as "Live" in your tracking system
- [ ] Provide client with support contact info

---

## Troubleshooting Checklist

If order doesn't appear in POS:

- [ ] Check Railway logs for errors
- [ ] Verify POS_SYSTEM variable is set correctly
- [ ] Verify all POS credentials are correct
- [ ] Check if Item ID exists in Google Sheet
- [ ] Verify Item ID matches POS system exactly
- [ ] Check POS system API status
- [ ] Verify client's POS account is active

---

## Time Tracking

**Your Time Per Client:**
- Square: ~7 minutes
- Toast: ~7 minutes
- Clover: ~17 minutes (includes app creation)

**Client Time Per Client:**
- All systems: ~15 minutes

**Total Setup Time:**
- Square: 22 minutes (no wait)
- Toast: 22 minutes work + 1-3 day wait
- Clover: 32 minutes work + 1-2 day wait

---

## Notes

- Keep a spreadsheet tracking all clients and their POS systems
- Document any custom requirements per client
- Save client credentials securely (password manager)
- Test periodically to ensure integration still works

