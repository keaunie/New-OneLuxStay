const fs = require('fs');
const path = 'src/DubaiLandingPage.jsx';
let c = fs.readFileSync(path, 'utf8');
const start = c.indexOf('<div className="la-inquiry-modal__body">', c.indexOf('Tell us who'));
if (start === -1) throw new Error('start not found');
const tail = '          </div>\n        </div>\n      )}';
const end = c.indexOf(tail, start);
if (end === -1) throw new Error('end not found');
const before = c.slice(0, start);
const after = c.slice(end);
const body = `<div className="la-inquiry-modal__body">
              <Stepper
                initialStep={1}
                onStepChange={(step) => setCheckoutStep(step)}
                onFinalStepCompleted={confirmGuestCheckout}
                disableStepIndicators
                nextButtonText="Next"
                finalButtonText="Continue to payment"
                nextButtonProps={{
                  disabled:
                    (checkoutStep === 1 && !isCheckoutGuestValid) ||
                    (checkoutStep === 2 && !checkoutConsentAccepted),
                }}
              >
                <Step>
                  <div className="la-inquiry-modal__step">
                    <label
                      className={
                        `la-inquiry-modal__field${
                          checkoutGuestError && !checkoutGuest.firstName.trim() ? " is-invalid" : ""
                        }`
                      }
                    >
                      <span>First name</span>
                      <input
                        type="text"
                        value={checkoutGuest.firstName}
                        autoComplete="given-name"
                        required
                        autoFocus
                        aria-invalid={Boolean(checkoutGuestError && !checkoutGuest.firstName.trim())}
                        onKeyDown={handleGuestKeyDown}
                        onChange={handleGuestInputChange("firstName")}
                      />
                    </label>
                    <label
                      className={
                        `la-inquiry-modal__field${
                          checkoutGuestError && !checkoutGuest.lastName.trim() ? " is-invalid" : ""
                        }`
                      }
                    >
                      <span>Last name</span>
                      <input
                        type="text"
                        value={checkoutGuest.lastName}
                        autoComplete="family-name"
                        required
                        aria-invalid={Boolean(checkoutGuestError && !checkoutGuest.lastName.trim())}
                        onKeyDown={handleGuestKeyDown}
                        onChange={handleGuestInputChange("lastName")}
                      />
                    </label>
                    <label
                      className={
                        `la-inquiry-modal__field${
                          checkoutGuestError && !checkoutGuest.email.trim() ? " is-invalid" : ""
                        }`
                      }
                    >
                      <span>Email</span>
                      <input
                        type="email"
                        value={checkoutGuest.email}
                        autoComplete="email"
                        required
                        aria-invalid={Boolean(checkoutGuestError && !checkoutGuest.email.trim())}
                        onKeyDown={handleGuestKeyDown}
                        onChange={handleGuestInputChange("email")}
                      />
                    </label>
                    <label className="la-inquiry-modal__field">
                      <span>Phone (optional)</span>
                      <input
                        type="tel"
                        value={checkoutGuest.phone}
                        autoComplete="tel"
                        onKeyDown={handleGuestKeyDown}
                        onChange={handleGuestInputChange("phone")}
                      />
                    </label>
                    {checkoutGuestError && (
                      <p className="la-inquiry-modal__note is-error" role="status" aria-live="polite">
                        {checkoutGuestError}
                      </p>
                    )}
                  </div>
                </Step>
                <Step>
                  <div className="la-inquiry-modal__step">
                    <label className="la-inquiry-modal__consent">
                      <input
                        type="checkbox"
                        checked={checkoutConsentAccepted}
                        onChange={(event) => setCheckoutConsentAccepted(event.target.checked)}
                      />
                      <span>
                        By continuing to payment, you authorize OneLuxStay to charge the total amount
                        shown for your reservation. A receipt will be emailed to you.
                      </span>
                    </label>
                  </div>
                </Step>
                <Step>
                  <div className="la-inquiry-modal__step">
                    <p className="la-inquiry-modal__fineprint">
                      Review your details and continue to payment.
                    </p>
                    <div className="la-inquiry-modal__summary">
                      <div>
                        <strong>Name</strong>
                        <span>
                          {checkoutGuest.firstName} {checkoutGuest.lastName}
                        </span>
                      </div>
                      <div>
                        <strong>Email</strong>
                        <span>{checkoutGuest.email}</span>
                      </div>
                      {checkoutGuest.phone && (
                        <div>
                          <strong>Phone</strong>
                          <span>{checkoutGuest.phone}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </Step>
              </Stepper>
            </div>
`;
fs.writeFileSync(path, before + body + after);
