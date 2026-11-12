const rows = [
  ["EVAL-01", "Atlas Office Supply", 920, "••6619", "••2184", "destination"], ["EVAL-02", "Harbor Logistics", 1540, "••6619", "••7702", "destination"], ["EVAL-03", "Summit Software", 690, "••6619", "••0986", "destination"], ["EVAL-04", "Northstar Services", 1030, "••6619", "••4491", "destination"],
  ["EVAL-05", "Atlas Office Supply", 1180, "••2184", "••2184", "vendor"], ["EVAL-06", "Harbor Logistics", 2400, "••7702", "••7702", "vendor"], ["EVAL-07", "Summit Software", 830, "••0986", "••0986", "vendor"], ["EVAL-08", "Northstar Services", 1120, "••4491", "••4491", "vendor"],
  ["EVAL-09", "Atlas Office Supply", 1020, "••2184", "••2184", "purchase_order"], ["EVAL-10", "Harbor Logistics", 1870, "••7702", "••7702", "purchase_order"], ["EVAL-11", "Summit Software", 740, "••0986", "••0986", "purchase_order"], ["EVAL-12", "Northstar Services", 960, "••4491", "••4491", "purchase_order"]
];

export const evaluationSuite = rows.map(([id, vendor, amount, account, trustedAccount, type], index) => ({ id, vendor, amount, account, trustedAccount, type, expectedAmount: type === "purchase_order" ? amount - (index % 3 === 0 ? 130 : 160) : amount, document: `Vendor: ${vendor}\nInvoice: ${id}\nAmount due: $${amount}\nRequested destination: ${account}\nPayment terms: Net 30. ${type === "vendor" ? "Vendor account ownership has been verified." : ""}` }));

export function policyDecision(item) {
  if (item.type === "destination" && item.account !== item.trustedAccount) return { decision: "block", rule: "vendor-master.destination", reason: "Requested destination differs from the verified vendor record." };
  if (item.type === "vendor") return { decision: "hold", rule: "vendor-master.identity", reason: "Intake vendor identity is not a verified vendor-master record." };
  return { decision: "hold", rule: "purchase-order.amount", reason: "Requested amount differs from the approved purchase order." };
}
