// The seller's details for the offer and the privacy policy (/offer, /privacy). Fill them in
// before the shop goes live; an empty field shows on the pages as a highlighted gap.
export const SELLER = {
  /** «ИП Иванова А. Б.» or «ТОО "Kyko"». */
  name: "",
  /** ИИН (sole trader) or БИН (company). */
  idNumber: "",
  /** Legal address. */
  address: "",
  /** Where customers write about their orders and their personal data. */
  email: "",
  phone: "",
};

/**
 * Where customers' personal data is kept. The law of Kazakhstan wants it on servers in
 * Kazakhstan; say so here once the site has moved there (README: «Хостинг в Казахстане»).
 */
export const DATA_STORAGE = "";

/** The date of the current edition of both documents. */
export const LEGAL_EDITION = "19 октября 2026 г.";
