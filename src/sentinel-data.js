const money = (id, merchant, amount, date, category, extra = {}) => ({
  id,
  merchant,
  amount,
  date,
  category,
  channel: "online",
  location: "San Francisco, CA",
  pending: false,
  ...extra,
});

export const personas = [
  {
    id: "maya",
    name: "Maya Chen",
    role: "Product designer",
    city: "San Francisco, CA",
    avatar: "MC",
    description:
      "Stable income, familiar merchants, and a clear late-night anomaly.",
  },
  {
    id: "jordan",
    name: "Jordan Lee",
    role: "Freelance photographer",
    city: "Los Angeles, CA",
    avatar: "JL",
    description:
      "Irregular income and variable spend make rigid thresholds unreliable.",
  },
  {
    id: "priya",
    name: "Priya Shah",
    role: "Consultant",
    city: "New York, NY",
    avatar: "PS",
    description:
      "Frequent travel tests whether the system can avoid false alarms.",
  },
];

const mayaHistory = [
  money("m-001", "Whole Foods", 68.42, "2026-11-02T18:12:00Z", "Groceries", {
    channel: "in store",
  }),
  money("m-002", "Uber", 21.8, "2026-11-03T01:18:00Z", "Travel"),
  money("m-003", "Spotify", 11.99, "2026-11-03T16:00:00Z", "Entertainment"),
  money(
    "m-004",
    "Blue Bottle Coffee",
    6.75,
    "2026-11-04T17:42:00Z",
    "Food and Drink",
    { channel: "in store" },
  ),
  money("m-005", "PG&E", 94.18, "2026-11-05T18:00:00Z", "Utilities"),
  money("m-006", "Chevron", 51.22, "2026-11-06T19:08:00Z", "Transportation", {
    channel: "in store",
  }),
  money(
    "m-007",
    "Amazon",
    42.18,
    "2026-11-07T20:12:00Z",
    "General Merchandise",
  ),
  money("m-008", "Whole Foods", 74.61, "2026-11-09T18:37:00Z", "Groceries", {
    channel: "in store",
  }),
  money("m-009", "Uber", 18.31, "2026-11-10T01:11:00Z", "Travel"),
  money("m-010", "Apple", 9.99, "2026-11-10T19:00:00Z", "Entertainment"),
  money(
    "m-011",
    "Best Buy",
    114.27,
    "2026-10-15T20:15:00Z",
    "General Merchandise",
  ),
  money("m-012", "Whole Foods", 59.92, "2026-10-22T18:04:00Z", "Groceries", {
    channel: "in store",
  }),
  money("m-013", "Chevron", 48.17, "2026-10-28T19:30:00Z", "Transportation"),
];
const jordanHistory = [
  money(
    "j-001",
    "B&H Photo",
    402.19,
    "2026-11-01T18:30:00Z",
    "General Merchandise",
  ),
  money("j-002", "Trader Joe's", 89.2, "2026-11-03T20:10:00Z", "Groceries", {
    channel: "in store",
    location: "Los Angeles, CA",
  }),
  money("j-003", "Uber", 37.4, "2026-11-04T04:11:00Z", "Travel", {
    location: "Los Angeles, CA",
  }),
  money("j-004", "Adobe", 59.99, "2026-11-05T18:00:00Z", "General Merchandise"),
  money(
    "j-005",
    "BH Photo Video",
    918.42,
    "2026-10-18T21:00:00Z",
    "General Merchandise",
  ),
  money("j-006", "Costco", 242.3, "2026-10-25T22:00:00Z", "Groceries", {
    channel: "in store",
    location: "Los Angeles, CA",
  }),
];
const priyaHistory = [
  money("p-001", "United Airlines", 612.51, "2026-11-01T16:00:00Z", "Travel"),
  money("p-002", "Marriott Boston", 340.22, "2026-11-05T22:00:00Z", "Travel", {
    location: "Boston, MA",
  }),
  money("p-003", "Lyft", 32.9, "2026-11-06T01:00:00Z", "Travel", {
    location: "Boston, MA",
  }),
  money("p-004", "Delta", 441.12, "2026-10-14T16:00:00Z", "Travel"),
  money("p-005", "Whole Foods", 75.19, "2026-10-17T20:00:00Z", "Groceries", {
    channel: "in store",
    location: "New York, NY",
  }),
  money("p-006", "Hilton Austin", 301.11, "2026-10-21T22:00:00Z", "Travel", {
    location: "Austin, TX",
  }),
];

export const scenarios = [
  {
    id: "S01",
    personaId: "maya",
    title: "An unrecognized $847 purchase",
    label: "fraud",
    target: money(
      "s01-target",
      "TECHHUB ONLINE",
      847.32,
      "2026-11-12T10:13:00Z",
      "General Merchandise",
      { location: "Austin, TX" },
    ),
    related: [
      money(
        "s01-a",
        "NOVA DIGITAL",
        1.24,
        "2026-11-12T09:45:00Z",
        "General Merchandise",
      ),
      money(
        "s01-b",
        "NOVA DIGITAL",
        2.18,
        "2026-11-12T09:57:00Z",
        "General Merchandise",
      ),
      money(
        "s01-c",
        "NOVA DIGITAL",
        3.07,
        "2026-11-12T10:05:00Z",
        "General Merchandise",
      ),
    ],
    history: mayaHistory,
  },
  {
    id: "S02",
    personaId: "maya",
    title: "A duplicate grocery receipt",
    label: "investigate",
    target: money(
      "s02-target",
      "Whole Foods",
      72.41,
      "2026-11-12T19:04:00Z",
      "Groceries",
      { channel: "in store" },
    ),
    related: [
      money(
        "s02-a",
        "Whole Foods",
        72.41,
        "2026-11-12T19:02:00Z",
        "Groceries",
        { channel: "in store" },
      ),
    ],
    history: mayaHistory,
  },
  {
    id: "S03",
    personaId: "maya",
    title: "An unexpected medical charge",
    label: "legitimate",
    target: money(
      "s03-target",
      "Sutter Health",
      684.18,
      "2026-11-11T18:30:00Z",
      "Health Care",
    ),
    related: [],
    history: mayaHistory,
  },
  {
    id: "S04",
    personaId: "maya",
    title: "A streaming bill that jumped",
    label: "investigate",
    target: money(
      "s04-target",
      "StreamBox",
      24.99,
      "2026-11-12T18:00:00Z",
      "Entertainment",
    ),
    related: [
      money(
        "s04-a",
        "StreamBox",
        13.99,
        "2026-10-12T18:00:00Z",
        "Entertainment",
      ),
    ],
    history: mayaHistory,
  },
  {
    id: "S05",
    personaId: "jordan",
    title: "New camera equipment",
    label: "legitimate",
    target: money(
      "s05-target",
      "Leica Store",
      1290,
      "2026-11-12T21:00:00Z",
      "General Merchandise",
      { channel: "in store", location: "Los Angeles, CA" },
    ),
    related: [
      money(
        "s05-a",
        "B&H Photo",
        402.19,
        "2026-11-01T18:30:00Z",
        "General Merchandise",
      ),
    ],
    history: jordanHistory,
  },
  {
    id: "S06",
    personaId: "jordan",
    title: "Fast purchases from unfamiliar stores",
    label: "fraud",
    target: money(
      "s06-target",
      "KICKS ONLINE",
      389.17,
      "2026-11-12T04:50:00Z",
      "General Merchandise",
      { location: "Miami, FL" },
    ),
    related: [
      money(
        "s06-a",
        "FASHION NOW",
        129.77,
        "2026-11-12T04:28:00Z",
        "General Merchandise",
        { location: "Miami, FL" },
      ),
      money(
        "s06-b",
        "URBAN GOODS",
        245.1,
        "2026-11-12T04:38:00Z",
        "General Merchandise",
        { location: "Miami, FL" },
      ),
    ],
    history: jordanHistory,
  },
  {
    id: "S07",
    personaId: "priya",
    title: "Dinner on a work trip",
    label: "legitimate",
    target: money(
      "s07-target",
      "Legal Sea Foods",
      96.41,
      "2026-11-06T02:10:00Z",
      "Food and Drink",
      { channel: "in store", location: "Boston, MA" },
    ),
    related: [
      money(
        "s07-a",
        "Marriott Boston",
        340.22,
        "2026-11-05T22:00:00Z",
        "Travel",
        { location: "Boston, MA" },
      ),
    ],
    history: priyaHistory,
  },
  {
    id: "S08",
    personaId: "priya",
    title: "$600 cash withdrawal away from home",
    label: "fraud",
    target: money(
      "s08-target",
      "ATM CASH WITHDRAWAL",
      600,
      "2026-11-12T03:20:00Z",
      "Cash Advance",
      { channel: "in store", location: "Las Vegas, NV" },
    ),
    related: [
      money(
        "s08-a",
        "NOVA DIGITAL",
        1.09,
        "2026-11-12T03:05:00Z",
        "General Merchandise",
        { location: "Las Vegas, NV" },
      ),
    ],
    history: priyaHistory,
  },
];
