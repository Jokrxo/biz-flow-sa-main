
import { TutorialStep } from '../Tutorial/TutorialGuide';

export const purchaseTutorialSteps: TutorialStep[] = [
  // SECTION 1 — SUPPLIER SETUP (FOUNDATION)
  {
    targetId: 'PurchaseHeader',
    title: 'Purchase Module Overview',
    content: 'This is the Purchase module where you manage suppliers, orders, invoices, and assets.',
    position: 'bottom',
    module: 'Purchase',
    order: 1
  },
  {
    targetId: 'Tab_ListOfSupplier',
    title: 'List of Supplier Tab',
    content: 'Suppliers must be created before you can record purchases.',
    position: 'bottom',
    module: 'Purchase',
    order: 2,
    action: 'click'
  },
  {
    targetId: 'AddSupplierButton',
    title: 'Add Supplier Button',
    content: 'Click here to add a new supplier.',
    position: 'bottom',
    module: 'Purchase',
    order: 3,
    action: 'click'
  },
  {
    targetId: 'SupplierNameInput',
    title: 'Supplier Name Field',
    content: 'Enter the supplier’s legal name.',
    position: 'bottom',
    module: 'Purchase',
    order: 4,
    action: 'input'
  },
  {
    targetId: 'SupplierOpeningBalanceInput',
    title: 'Opening Balance Field',
    content: 'Add any amount you already owe this supplier (optional).',
    position: 'bottom',
    module: 'Purchase',
    order: 5,
    action: 'input'
  },
  {
    targetId: 'SaveSupplierButton',
    title: 'Save Supplier Button',
    content: 'Save the supplier to continue.',
    position: 'top',
    module: 'Purchase',
    order: 6,
    action: 'click'
  },

  // SECTION 2 — PURCHASE ORDERS (OPTIONAL BUT RECOMMENDED)
  {
    targetId: 'Tab_PurchaseOrders',
    title: 'Purchase Orders Tab',
    content: 'Purchase Orders help you track orders before receiving an invoice.',
    position: 'bottom',
    module: 'Purchase',
    order: 7,
    action: 'click'
  },
  {
    targetId: 'AddPurchaseOrderButton',
    title: 'Create Purchase Order Button',
    content: 'Create a purchase order for goods or services.',
    position: 'bottom',
    module: 'Purchase',
    order: 8,
    action: 'click'
  },
  {
    targetId: 'SavePurchaseOrderButton',
    title: 'Save Purchase Order Button',
    content: 'Save the purchase order.',
    position: 'top',
    module: 'Purchase',
    order: 9,
    action: 'click'
  },

  // SECTION 3 — SUPPLIER INVOICES (ACCOUNTING ENTRY)
  {
    targetId: 'Tab_SupplierInvoice',
    title: 'Supplier Invoice Tab',
    content: 'Supplier invoices create accounting entries and affect supplier balances.',
    position: 'bottom',
    module: 'Purchase',
    order: 10,
    action: 'click'
  },
  {
    targetId: 'AddSupplierInvoiceButton',
    title: 'Add Supplier Invoice Button',
    content: 'Record an invoice received from a supplier.',
    position: 'bottom',
    module: 'Purchase',
    order: 11,
    action: 'click'
  },
  {
    targetId: 'InvoiceTotalInput',
    title: 'Invoice Total Field',
    content: 'Enter the invoice amount.',
    position: 'bottom',
    module: 'Purchase',
    order: 12,
    action: 'input'
  },
  {
    targetId: 'SaveSupplierInvoiceButton',
    title: 'Save Supplier Invoice Button',
    content: 'Save the invoice to update supplier balances.',
    position: 'top',
    module: 'Purchase',
    order: 13,
    action: 'click'
  },

  // SECTION 4 — ASSETS (CAPITAL PURCHASES)
  {
    targetId: 'Tab_Assets',
    title: 'Assets Tab',
    content: 'Use Assets to record capital items like equipment and vehicles.',
    position: 'bottom',
    module: 'Purchase',
    order: 14,
    action: 'click'
  },
  {
    targetId: 'AddAssetButton',
    title: 'Add Asset Button',
    content: 'Create a new asset from a purchase.',
    position: 'bottom',
    module: 'Purchase',
    order: 15,
    action: 'click'
  },
  {
    targetId: 'SaveAssetButton',
    title: 'Save Asset Button',
    content: 'Save the asset record.',
    position: 'top',
    module: 'Purchase',
    order: 16,
    action: 'click'
  },

  // FINAL STEP — COMPLETION
  {
    targetId: 'PurchaseModuleContainer',
    title: 'Completion Message',
    content: 'You’ve completed the Purchase module tutorial.',
    position: 'center',
    module: 'Purchase',
    order: 17
  }
];
