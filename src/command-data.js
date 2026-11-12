export const paymentFixtures = [
  { id: "PTX-10482", customer: "Avery Chen", merchant: "Northstar Goods", amount: 128, destination: "••2184", device: "dev-amber", location: "Seattle, WA", ageMinutes: 4, status: "PENDING", tags: [] },
  { id: "PTX-10483", customer: "Jordan Lee", merchant: "Northstar Goods", amount: 86, destination: "••2184", device: "dev-cobalt", location: "Seattle, WA", ageMinutes: 11, status: "PENDING", tags: [] },
  { id: "PTX-10484", customer: "Morgan Patel", merchant: "Harbor Air", amount: 2450, destination: "••7702", device: "dev-cobalt", location: "New York, NY", ageMinutes: 16, status: "PENDING", tags: ["new_device"] },
  { id: "PTX-10485", customer: "Taylor Reed", merchant: "Asteron Digital", amount: 4910, destination: "••6619", device: "dev-ghost", location: "New York, NY", ageMinutes: 19, status: "PENDING", tags: ["shared_device", "new_destination"] },
  { id: "PTX-10486", customer: "Riley Kim", merchant: "Asteron Digital", amount: 4760, destination: "••6619", device: "dev-ghost", location: "New York, NY", ageMinutes: 24, status: "PENDING", tags: ["shared_device", "new_destination"] },
  { id: "PTX-10487", customer: "Sam Rivera", merchant: "Asteron Digital", amount: 5180, destination: "••6619", device: "dev-ghost", location: "Boston, MA", ageMinutes: 27, status: "PENDING", tags: ["shared_device", "new_destination", "velocity"] },
  { id: "PTX-10488", customer: "Casey Brooks", merchant: "Elm Ridge Supply", amount: 920, destination: "••9017", device: "dev-maple", location: "Chicago, IL", ageMinutes: 34, status: "PENDING", tags: ["new_device"] },
  { id: "PTX-10489", customer: "Jamie Park", merchant: "Harbor Air", amount: 640, destination: "••7702", device: "dev-slate", location: "Los Angeles, CA", ageMinutes: 41, status: "PENDING", tags: [] }
];

export const knownDeviceUses = { "dev-amber": 1, "dev-cobalt": 2, "dev-ghost": 7, "dev-maple": 1, "dev-slate": 4 };
export const flaggedDestinations = new Set(["••6619"]);
