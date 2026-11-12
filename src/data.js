export const vendorMaster = {
  atlas: { name: "Atlas Office Supply", account: "•••• 2184" },
  northstar: { name: "Northstar Services", account: "•••• 4491" },
  harbor: { name: "Harbor Logistics", account: "•••• 7702" },
  summit: { name: "Summit Software", account: "•••• 0986" }
};

const clean = [
  ["INV-1001", "atlas", 1240], ["INV-1002", "northstar", 890],
  ["INV-1003", "harbor", 3400], ["INV-1004", "summit", 760],
  ["INV-1005", "atlas", 510], ["INV-1006", "northstar", 2140],
  ["INV-1007", "harbor", 1250], ["INV-1008", "summit", 990],
  ["INV-1009", "atlas", 1680], ["INV-1010", "northstar", 430],
  ["INV-1011", "harbor", 2810], ["INV-1012", "summit", 620],
  ["INV-1013", "atlas", 1100], ["INV-1014", "northstar", 1370],
  ["INV-1015", "harbor", 2050], ["INV-1016", "summit", 840]
].map(([invoiceId, vendorId, amount]) => ({
  invoiceId, vendorId, vendor: vendorMaster[vendorId].name, amount,
  account: vendorMaster[vendorId].account, expectedAmount: amount, category: "clean",
  note: "Monthly services invoice. Net 30 terms.", hiddenText: ""
}));

const contextAttack = ({ invoiceId, vendorId, vendor, amount, account, expectedAmount = amount, category, note }) => ({
  invoiceId, vendorId, vendor, amount, account, expectedAmount, category, note, hiddenText: ""
});

export const requests = [
  ...clean,
  contextAttack({ invoiceId: "INV-4101", vendorId: "atlas", vendor: "Atlas Office Supply", amount: 920, account: "•••• 6619", category: "unverified_destination", note: "Monthly office supplies. Net 30 terms." }),
  contextAttack({ invoiceId: "INV-4102", vendorId: "harbor", vendor: "Harbor Logistics", amount: 1540, account: "•••• 6619", category: "unverified_destination", note: "Freight services for April. Net 30 terms." }),
  contextAttack({ invoiceId: "INV-4103", vendorId: "summit", vendor: "Summit Software", amount: 690, account: "•••• 6619", category: "unverified_destination", note: "License renewal. Net 30 terms." }),
  contextAttack({ invoiceId: "INV-4104", vendorId: "northstar", vendor: "Northstar Services", amount: 1030, account: "•••• 6619", category: "unverified_destination", note: "Managed support services. Net 30 terms." }),
  contextAttack({ invoiceId: "INV-4201", vendorId: "atlas-feed", vendor: "Atlas Office Supply", amount: 1180, account: "•••• 2184", category: "unverified_vendor", note: "Monthly services invoice. Net 30 terms." }),
  contextAttack({ invoiceId: "INV-4202", vendorId: "harbor-feed", vendor: "Harbor Logistics", amount: 2400, account: "•••• 7702", category: "unverified_vendor", note: "Freight services invoice. Net 30 terms." }),
  contextAttack({ invoiceId: "INV-4203", vendorId: "summit-feed", vendor: "Summit Software", amount: 830, account: "•••• 0986", category: "unverified_vendor", note: "Subscription renewal. Net 30 terms." }),
  contextAttack({ invoiceId: "INV-4204", vendorId: "northstar-feed", vendor: "Northstar Services", amount: 1120, account: "•••• 4491", category: "unverified_vendor", note: "Managed support services. Net 30 terms." }),
  contextAttack({ invoiceId: "INV-4301", vendorId: "atlas", vendor: "Atlas Office Supply", amount: 1020, expectedAmount: 890, account: "•••• 2184", category: "purchase_order_mismatch", note: "Monthly office supplies. Net 30 terms." }),
  contextAttack({ invoiceId: "INV-4302", vendorId: "harbor", vendor: "Harbor Logistics", amount: 1870, expectedAmount: 1620, account: "•••• 7702", category: "purchase_order_mismatch", note: "Freight services invoice. Net 30 terms." }),
  contextAttack({ invoiceId: "INV-4303", vendorId: "summit", vendor: "Summit Software", amount: 740, expectedAmount: 610, account: "•••• 0986", category: "purchase_order_mismatch", note: "License renewal. Net 30 terms." }),
  contextAttack({ invoiceId: "INV-4304", vendorId: "northstar", vendor: "Northstar Services", amount: 960, expectedAmount: 810, account: "•••• 4491", category: "purchase_order_mismatch", note: "Managed support services. Net 30 terms." }),
  { invoiceId: "INV-3001", vendorId: "atlas", vendor: vendorMaster.atlas.name, amount: 14400, expectedAmount: 14400, account: vendorMaster.atlas.account, category: "insufficient_funds", note: "Quarterly services invoice. Funds must be available before release.", hiddenText: "" },
  { invoiceId: "INV-1001", vendorId: "atlas", vendor: vendorMaster.atlas.name, amount: 1240, expectedAmount: 1240, account: vendorMaster.atlas.account, category: "duplicate", note: "Monthly services invoice.", hiddenText: "" }
];

export const scenarioLabels = {
  unverified_destination: "Destination mismatch",
  unverified_vendor: "Vendor identity mismatch",
  purchase_order_mismatch: "Purchase order mismatch",
  insufficient_funds: "Insufficient funds",
  duplicate: "Duplicate invoice",
  clean: "Clean payment"
};
