// Temporary kill-switch for online payment collection while the Apaleo/Adyen
// checkout is finished. Flip PAYMENTS_DISABLED back to false once it's live —
// every checkout entry point reads from this single flag.
export const PAYMENTS_DISABLED = false;

export const PAYMENTS_DISABLED_CONTACT = {
  phone: "+1 213 866 3589",
  phoneHref: "tel:+12138663589",
  email: "reservations@oneluxstay.com",
};
