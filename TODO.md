# PapaT Connection Simplification - TODO

## Completed Steps:

1. ✅ **Step 1**: Simplify `mobile/src/components/ConnectionBar.tsx` 
   - Made "Scan QR Code to Connect" the primary action in unconnected state
   - IP/port fields hidden behind "Enter IP & code manually" collapsible section
   - Removed the manual code entry row from default view
   - QR scan immediately triggers connection (no extra button press)
   - Paired state shows Connect/Scan new QR/Forget options
   - Kept "Forget device" functionality for paired state

2. ✅ **Step 2**: Update `mobile/src/components/ServerOfflinePanel.tsx`
   - Simplified instructions to emphasize QR scan
   - Removed the multi-step manual entry instructions

3. ✅ **Step 3**: Update `desktop-ui/index.html`
   - Updated steps to emphasize tapping "Scan QR Code" in the app
   - Added note that QR contains everything needed

