import { getAvailabilityAndPricing as getGuestyAvailabilityAndPricing } from "./guestyService.js";
import {
  getAvailabilityAndPricingFromSupabase,
  isSupabaseAvailabilityEnabled,
  shouldFallbackToGuestyOnSupabaseError,
} from "./supabaseAvailabilityService.js";
import { roundMoney } from "./pricingService.js";
import { resolveSecurityDeposit } from "./securityDepositService.js";

export const getAvailabilityAndPricing = async (params = {}) => {
  let availability = null;

  if (!isSupabaseAvailabilityEnabled()) {
    availability = await getGuestyAvailabilityAndPricing(params);
  } else {
    try {
      availability = await getAvailabilityAndPricingFromSupabase(params);
    } catch (error) {
      if (!shouldFallbackToGuestyOnSupabaseError()) {
        throw error;
      }

      console.warn("Supabase availability failed, falling back to Guesty", {
        message: error?.message || String(error),
      });

      availability = await getGuestyAvailabilityAndPricing(params);
    }
  }

  if (!availability?.available) {
    return {
      ...availability,
      securityDeposit: 0,
    };
  }

  const securityDeposit = await resolveSecurityDeposit({
    listingId: params?.propertyId,
    currency: availability?.currency,
  });

  return {
    ...availability,
    securityDeposit: roundMoney(securityDeposit?.amount) || 0,
    securityDepositCurrency:
      securityDeposit?.currency || String(availability?.currency || "USD").toUpperCase(),
  };
};
