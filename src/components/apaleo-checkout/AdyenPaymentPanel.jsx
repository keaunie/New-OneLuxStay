import { useEffect, useRef, useState } from "react";

// Mounts Adyen's Drop-in against the payment methods / configuration returned by
// api-booking-payment-methods.js (flow.paymentMethodsConfig), and routes submit/3DS
// callbacks through useApaleoBookingFlow's submitPayment/submitPaymentDetails, which
// call api-booking-payments.js / api-booking-payment-details.js.
//
// Advanced-flow contract (per node_modules/@adyen/adyen-web's CoreConfiguration types):
// onSubmit/onAdditionalDetails receive a third `actions` argument and MUST call
// actions.resolve(response)/actions.reject() with the raw /payments or /payments/details
// response — Drop-in uses that call to drive its own success/error/3DS-action UI
// internally. It does not work to skip resolve/reject and call component.setStatus()/
// handleAction() directly instead; the Pay button's own loading state depends on
// resolve/reject firing.

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
        const [{ AdyenCheckout }] = await Promise.all([
          import("@adyen/adyen-web"),
          import("@adyen/adyen-web/styles/adyen.css"),
        ]);
        if (cancelled) return;

        // Reports the outcome to our own onAuthorized/onDeclined hooks. Drop-in's own
        // success/error/3DS-challenge UI is driven separately, by whatever we pass to
        // actions.resolve()/reject() at each call site below — not by this function.
        const reportOutcome = (result) => {
          if (result?.action) return; // Drop-in is about to show a 3DS/redirect challenge; not a final outcome yet.
          if (result?.resultCode === "Authorised") {
            onAuthorized?.(result);
          } else {
            setErrorMessage("Payment was not authorized. Please try another payment method.");
            onDeclined?.(result);
          }
        };

        const checkoutInstance = await AdyenCheckout({
          environment: config.configuration?.environment || "test",
          clientKey: config.configuration?.clientKey,
          locale: config.shopperLocale || navigator.language || "en-US",
          paymentMethodsResponse: config,
          amount: { value: Number(flow.session?.prepayment_minor) || 0, currency: flow.session?.currency },
          onSubmit: async (state, component, actions) => {
            try {
              const result = await flow.submitPayment({
                paymentMethod: state.data.paymentMethod,
                browserInfo: state.data.browserInfo,
                origin: window.location.origin,
              });
              actions.resolve(result);
              reportOutcome(result);
            } catch (err) {
              actions.reject();
              if (err?.code === "PRICE_CHANGED") {
                setErrorMessage("The price changed — please review the updated total and try again.");
              } else {
                setErrorMessage(err?.message || "Payment failed.");
              }
              onDeclined?.(err);
            }
          },
          onAdditionalDetails: async (state, component, actions) => {
            try {
              const result = await flow.submitPaymentDetails({
                details: state.data.details,
                paymentData: state.data.paymentData,
              });
              actions.resolve(result);
              reportOutcome(result);
            } catch (err) {
              actions.reject();
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
