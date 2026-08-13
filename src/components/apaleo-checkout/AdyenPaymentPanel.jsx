import { useEffect, useRef, useState } from "react";

// Mounts Adyen's Drop-in against the payment methods / configuration returned by
// api-booking-payment-methods.js (flow.paymentMethodsConfig), and routes submit/3DS
// callbacks through useApaleoBookingFlow's submitPayment/submitPaymentDetails, which
// call api-booking-payments.js / api-booking-payment-details.js.
//
// `@adyen/adyen-web` has no other consumer in this codebase yet — this is the first
// integration, built against its documented v6 Drop-in API. Verify against a real
// Adyen test merchant once credentials are available (see docs/apaleo-ibe-deployment.md
// and docs/apaleo-rollout-other-cities.md); this could not be exercised in a browser
// in this environment.

export default function AdyenPaymentPanel({ flow, onAuthorized, onDeclined }) {
  const containerRef = useRef(null);
  const dropinRef = useRef(null);
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [errorMessage, setErrorMessage] = useState("");

  const config = flow.paymentMethodsConfig;
  const paymentRequired = config?.paymentRequired !== false;

  useEffect(() => {
    if (!paymentRequired || !config) return undefined;
    let cancelled = false;

    const mount = async () => {
      try {
        const [{ default: AdyenCheckout }] = await Promise.all([
          import("@adyen/adyen-web"),
          import("@adyen/adyen-web/styles/adyen.css"),
        ]);
        if (cancelled) return;

        const handleResult = (result, component) => {
          if (result?.action) {
            component.handleAction(result.action);
            return;
          }
          if (result?.resultCode === "Authorised") {
            component.setStatus("success");
            onAuthorized?.(result);
            return;
          }
          component.setStatus("error");
          setErrorMessage("Payment was not authorized. Please try another payment method.");
          onDeclined?.(result);
        };

        const checkoutInstance = await AdyenCheckout({
          environment: config.configuration?.environment || "test",
          clientKey: config.configuration?.clientKey,
          paymentMethodsResponse: config,
          amount: { value: Number(flow.session?.prepayment_minor) || 0, currency: flow.session?.currency },
          onSubmit: async (state, component) => {
            try {
              const result = await flow.submitPayment({
                paymentMethod: state.data.paymentMethod,
                browserInfo: state.data.browserInfo,
                origin: window.location.origin,
              });
              handleResult(result, component);
            } catch (err) {
              component.setStatus("error");
              if (err?.code === "PRICE_CHANGED") {
                setErrorMessage("The price changed — please review the updated total and try again.");
              } else {
                setErrorMessage(err?.message || "Payment failed.");
              }
              onDeclined?.(err);
            }
          },
          onAdditionalDetails: async (state, component) => {
            try {
              const result = await flow.submitPaymentDetails({
                details: state.data.details,
                paymentData: state.data.paymentData,
              });
              handleResult(result, component);
            } catch (err) {
              component.setStatus("error");
              setErrorMessage(err?.message || "Payment verification failed.");
              onDeclined?.(err);
            }
          },
          onError: (error, component) => {
            setErrorMessage(error?.message || "Payment error.");
            component?.setStatus?.("error");
          },
        });

        if (cancelled) return;
        dropinRef.current = checkoutInstance.create("dropin").mount(containerRef.current);
        setStatus("ready");
      } catch (err) {
        if (!cancelled) {
          setStatus("error");
          setErrorMessage(err?.message || "Unable to load the payment form.");
        }
      }
    };

    mount();
    return () => {
      cancelled = true;
      try {
        dropinRef.current?.unmount?.();
      } catch {
        // ignore unmount races
      }
      dropinRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, paymentRequired]);

  if (!paymentRequired) {
    return <p className="apaleo-payment-panel__none">No payment is required now — you'll pay at the property.</p>;
  }

  return (
    <div className="apaleo-payment-panel">
      {status === "loading" && <p className="apaleo-payment-panel__loading">Loading secure payment form…</p>}
      {errorMessage && <p className="apaleo-payment-panel__error">{errorMessage}</p>}
      <div ref={containerRef} className="apaleo-payment-panel__dropin" />
    </div>
  );
}
