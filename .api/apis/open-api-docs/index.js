"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var oas_1 = __importDefault(require("oas"));
var core_1 = __importDefault(require("api/dist/core"));
var openapi_json_1 = __importDefault(require("./openapi.json"));
var SDK = /** @class */ (function () {
    function SDK() {
        this.spec = oas_1.default.init(openapi_json_1.default);
        this.core = new core_1.default(this.spec, 'open-api-docs/1 (api/6.1.3)');
    }
    /**
     * Optionally configure various options that the SDK allows.
     *
     * @param config Object of supported SDK options and toggles.
     * @param config.timeout Override the default `fetch` request timeout of 30 seconds. This number
     * should be represented in milliseconds.
     */
    SDK.prototype.config = function (config) {
        this.core.setConfig(config);
    };
    /**
     * If the API you're using requires authentication you can supply the required credentials
     * through this method and the library will magically determine how they should be used
     * within your API request.
     *
     * With the exception of OpenID and MutualTLS, it supports all forms of authentication
     * supported by the OpenAPI specification.
     *
     * @example <caption>HTTP Basic auth</caption>
     * sdk.auth('username', 'password');
     *
     * @example <caption>Bearer tokens (HTTP or OAuth 2)</caption>
     * sdk.auth('myBearerToken');
     *
     * @example <caption>API Keys</caption>
     * sdk.auth('myApiKey');
     *
     * @see {@link https://spec.openapis.org/oas/v3.0.3#fixed-fields-22}
     * @see {@link https://spec.openapis.org/oas/v3.1.0#fixed-fields-22}
     * @param values Your auth credentials for the API; can specify up to two strings or numbers.
     */
    SDK.prototype.auth = function () {
        var _a;
        var values = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            values[_i] = arguments[_i];
        }
        (_a = this.core).setAuth.apply(_a, values);
        return this;
    };
    /**
     * If the API you're using offers alternate server URLs, and server variables, you can tell
     * the SDK which one to use with this method. To use it you can supply either one of the
     * server URLs that are contained within the OpenAPI definition (along with any server
     * variables), or you can pass it a fully qualified URL to use (that may or may not exist
     * within the OpenAPI definition).
     *
     * @example <caption>Server URL with server variables</caption>
     * sdk.server('https://{region}.api.example.com/{basePath}', {
     *   name: 'eu',
     *   basePath: 'v14',
     * });
     *
     * @example <caption>Fully qualified server URL</caption>
     * sdk.server('https://eu.api.example.com/v14');
     *
     * @param url Server URL
     * @param variables An object of variables to replace into the server URL.
     */
    SDK.prototype.server = function (url, variables) {
        if (variables === void 0) { variables = {}; }
        this.core.setServer(url, variables);
    };
    /**
     * Create additional fee on account level
     *
     */
    SDK.prototype.postAdditionalFeesAccount = function (body) {
        return this.core.fetch('/additional-fees/account', 'post', body);
    };
    /**
     * Get list of additional fees for account
     *
     */
    SDK.prototype.getAdditionalFeesAccount = function () {
        return this.core.fetch('/additional-fees/account', 'get');
    };
    /**
     * Create additional fee on listing level
     *
     */
    SDK.prototype.postAdditionalFeesListingListingid = function (body, metadata) {
        return this.core.fetch('/additional-fees/listing/{listingId}', 'post', body, metadata);
    };
    /**
     * Get list of additional fees for listing
     *
     */
    SDK.prototype.getAdditionalFeesListingListingid = function (metadata) {
        return this.core.fetch('/additional-fees/listing/{listingId}', 'get', metadata);
    };
    SDK.prototype.patchAdditionalFeesId = function (body, metadata) {
        return this.core.fetch('/additional-fees/{id}', 'patch', body, metadata);
    };
    /**
     * Delete existing additional fee
     *
     */
    SDK.prototype.deleteAdditionalFeesId = function (metadata) {
        return this.core.fetch('/additional-fees/{id}', 'delete', metadata);
    };
    /**
     * Calculate additional fee amount for quote [Beta]
     *
     * @summary Calculate additional fee amount for quote [Beta]
     */
    SDK.prototype.postAdditionalFeesQuotesQuoteidAmount = function (body, metadata) {
        return this.core.fetch('/additional-fees/quotes/{quoteId}/amount', 'post', body, metadata);
    };
    /**
     * Add upsell fee to inquiry rate plans quotes. Add upsell fee id multiple times if you
     * want to add the same upsell fee multiple times. To remove the upsell fee exclude the ID
     * from an array [Beta]
     *
     * @summary Add upsell fee to inquiry rate plans quotes [Beta]
     */
    SDK.prototype.postAdditionalFeesInquiriesInquiryidUpsells = function (body, metadata) {
        return this.core.fetch('/additional-fees/inquiries/{inquiryId}/upsells', 'post', body, metadata);
    };
    /**
     * Get account details of current user.
     *
     */
    SDK.prototype.getAccountsMe = function () {
        return this.core.fetch('/accounts/me', 'get');
    };
    /**
     * Get All Custom Fields
     *
     */
    SDK.prototype.getAccountsIdCustomFields = function (metadata) {
        return this.core.fetch('/accounts/{id}/custom-fields', 'get', metadata);
    };
    SDK.prototype.postAccountsIdCustomFields = function (body, metadata) {
        return this.core.fetch('/accounts/{id}/custom-fields', 'post', body, metadata);
    };
    SDK.prototype.putAccountsIdCustomFields = function (body, metadata) {
        return this.core.fetch('/accounts/{id}/custom-fields', 'put', body, metadata);
    };
    /**
     * Get Custom Field
     *
     */
    SDK.prototype.getAccountsIdCustomFieldsField_id = function (metadata) {
        return this.core.fetch('/accounts/{id}/custom-fields/{field_id}', 'get', metadata);
    };
    /**
     * Delete Custom Field
     *
     */
    SDK.prototype.deleteAccountsIdCustomFieldsField_id = function (metadata) {
        return this.core.fetch('/accounts/{id}/custom-fields/{field_id}', 'delete', metadata);
    };
    /**
     * Http endpoint to retrieve brandings by property id.
     *
     * @summary Get brand by property_id.
     * @throws FetchError<500, types.ExternalIntegrationsControllerGetBrandByPropertyResponse500> API error.
     */
    SDK.prototype.externalIntegrationsController_getBrandByProperty = function (metadata) {
        return this.core.fetch('/account-brands/properties/{propertyId}', 'get', metadata);
    };
    /**
     * Obtain a list of custom fields that are set on the selected property.
     *
     * @summary List Custom Fields per Property
     * @throws FetchError<403, types.GetAllResponse403> Unauthorized Request.
     * @throws FetchError<404, types.GetAllResponse404> Property not found.
     */
    SDK.prototype.getAll = function (metadata) {
        return this.core.fetch('/properties-api/custom-fields/{propertyId}', 'get', metadata);
    };
    /**
     * Update many custom fields of property at once. It will only update custom fields of
     * property, if You need to remove other fields please use DELETE endpoint
     *
     * @summary Update property Custom Fields
     * @throws FetchError<403, types.UpdateManyResponse403> Unauthorized Request.
     * @throws FetchError<404, types.UpdateManyResponse404> Property not found.
     */
    SDK.prototype.updateMany = function (body, metadata) {
        return this.core.fetch('/properties-api/custom-fields/{propertyId}', 'put', body, metadata);
    };
    /**
     * Retrieve a specific custom field for a select property using the custom field ID.
     *
     * @summary Get Custom Field from Selected Property
     * @throws FetchError<403, types.GetByFieldIdResponse403> Unauthorized Request.
     * @throws FetchError<404, types.GetByFieldIdResponse404> Property not found.
     */
    SDK.prototype.getByFieldId = function (metadata) {
        return this.core.fetch('/properties-api/custom-fields/{propertyId}/{fieldId}', 'get', metadata);
    };
    /**
     * Delete a specific custom field value from property
     *
     * @summary Delete Custom Field from property
     * @throws FetchError<403, types.DeleteResponse403> Unauthorized Request.
     * @throws FetchError<404, types.DeleteResponse404> Property not found.
     */
    SDK.prototype.delete = function (metadata) {
        return this.core.fetch('/properties-api/custom-fields/{propertyId}/{fieldId}', 'delete', metadata);
    };
    /**
     * List all users
     *
     * @summary List all users
     * @throws FetchError<400, types.UsersHttpControllerGetUsersResponse400> Bad request
     */
    SDK.prototype.usersHttpController_getUsers = function (metadata) {
        return this.core.fetch('/users', 'get', metadata);
    };
    /**
     * Create a new user
     *
     * @summary Create user
     * @throws FetchError<400, types.UsersHttpControllerCreateUserResponse400> Bad request
     */
    SDK.prototype.usersHttpController_createUser = function (body) {
        return this.core.fetch('/users', 'post', body);
    };
    /**
     * Get a user by ID.
     *
     * @summary Get user
     * @throws FetchError<400, types.UsersHttpControllerGetUserByIdResponse400> Bad request
     */
    SDK.prototype.usersHttpController_getUserById = function (metadata) {
        return this.core.fetch('/users/{id}', 'get', metadata);
    };
    /**
     * Update user by ID
     *
     * @summary Update user
     * @throws FetchError<400, types.UsersHttpControllerUpdateUserResponse400> Bad request
     */
    SDK.prototype.usersHttpController_updateUser = function (body, metadata) {
        return this.core.fetch('/users/{id}', 'put', body, metadata);
    };
    /**
     * Delete user by ID
     *
     * @summary Delete user
     * @throws FetchError<400, types.UsersHttpControllerRemoveUserResponse400> Bad request
     */
    SDK.prototype.usersHttpController_removeUser = function (metadata) {
        return this.core.fetch('/users/{id}', 'delete', metadata);
    };
    /**
     * Retrieve a list of all your account integrations.
     *
     * @summary List all integrations
     * @throws FetchError<401, types.GetIntegrationsResponse401> Unauthorized
     * @throws FetchError<500, types.GetIntegrationsResponse500> Unhandled exception. Something went wrong on server.
     */
    SDK.prototype.getIntegrations = function (metadata) {
        return this.core.fetch('/integrations', 'get', metadata);
    };
    /**
     * Create an integration.
     *
     * @summary Create integration
     * @throws FetchError<401, types.PostIntegrationsResponse401> Unauthorized
     * @throws FetchError<500, types.PostIntegrationsResponse500> Unhandled exception. Something went wrong on server.
     */
    SDK.prototype.postIntegrations = function (body) {
        return this.core.fetch('/integrations', 'post', body);
    };
    /**
     * Use this endpoint to retrieve all a single account integration.
     *
     * @summary Get integration
     * @throws FetchError<401, types.GetIntegrationsIdResponse401> Unauthorized
     * @throws FetchError<403, types.GetIntegrationsIdResponse403> Forbidden
     * @throws FetchError<404, types.GetIntegrationsIdResponse404> Not Found
     * @throws FetchError<500, types.GetIntegrationsIdResponse500> Unhandled exception. Something went wrong on server.
     */
    SDK.prototype.getIntegrationsId = function (metadata) {
        return this.core.fetch('/integrations/{id}', 'get', metadata);
    };
    SDK.prototype.putIntegrationsId = function (body, metadata) {
        return this.core.fetch('/integrations/{id}', 'put', body, metadata);
    };
    /**
     * Retrieve all listings
     *
     */
    SDK.prototype.getListings = function (metadata) {
        return this.core.fetch('/listings', 'get', metadata);
    };
    /**
     * Create a listing
     *
     */
    SDK.prototype.postListings = function (body) {
        return this.core.fetch('/listings', 'post', body);
    };
    /**
     * Retrieve a listing
     *
     */
    SDK.prototype.getListingsId = function (metadata) {
        return this.core.fetch('/listings/{id}', 'get', metadata);
    };
    SDK.prototype.putListingsId = function (body, metadata) {
        return this.core.fetch('/listings/{id}', 'put', body, metadata);
    };
    /**
     * Delete a listing
     *
     */
    SDK.prototype.deleteListingsId = function (metadata) {
        return this.core.fetch('/listings/{id}', 'delete', metadata);
    };
    /**
     * Update listings availability settings
     *
     */
    SDK.prototype.putListingsIdAvailabilitySettings = function (body, metadata) {
        return this.core.fetch('/listings/{id}/availability-settings', 'put', body, metadata);
    };
    /**
     * List all cities
     *
     */
    SDK.prototype.getListingsCities = function () {
        return this.core.fetch('/listings/cities', 'get');
    };
    /**
     * List all tags
     *
     */
    SDK.prototype.getListingsTags = function () {
        return this.core.fetch('/listings/tags', 'get');
    };
    /**
     * providerAccountId is important! - this is how you identify with Stripe once the clearing
     * payment
     *
     * @summary Retrieve a listing's paymentProviderId
     */
    SDK.prototype.getListingsIdFieldsPaymentproviderid = function (metadata) {
        return this.core.fetch('/listings/{id}?fields=paymentProviderId', 'get', metadata);
    };
    /**
     * Same as GET /listings but results are returned as a downloadable csv file
     *
     * @summary Export as CSV
     */
    SDK.prototype.postListingsCsv = function () {
        return this.core.fetch('/listings.csv', 'post');
    };
    /**
     * Same as /listings but results are sent as an email
     *
     * @summary Send results in email
     */
    SDK.prototype.postListingsEmail = function (body) {
        return this.core.fetch('/listings.email', 'post', body);
    };
    /**
     * Get custom fields such as wifi password etc.
     *
     * @summary Get all listing's custom fields
     */
    SDK.prototype.getListingsIdCustomFields = function (metadata) {
        return this.core.fetch('/listings/{id}/custom-fields', 'get', metadata);
    };
    SDK.prototype.putListingsIdCustomFields = function (body, metadata) {
        return this.core.fetch('/listings/{id}/custom-fields', 'put', body, metadata);
    };
    /**
     * Get custom field-Listings
     *
     */
    SDK.prototype.getListingsIdCustomFieldsField_id = function (metadata) {
        return this.core.fetch('/listings/{id}/custom-fields/{field_id}', 'get', metadata);
    };
    /**
     * Delete listing's custom fields
     *
     */
    SDK.prototype.deleteListingsListing_idCustomFieldsField_id = function (metadata) {
        return this.core.fetch('/listings/{listing_id}/custom-fields/{field_id}', 'delete', metadata);
    };
    /**
     * Retrieve listing Financials
     *
     */
    SDK.prototype.getFinancialsListingId = function (metadata) {
        return this.core.fetch('/financials/listing/{id}', 'get', metadata);
    };
    SDK.prototype.putFinancialsListingId = function (body, metadata) {
        return this.core.fetch('/financials/listing/{id}', 'put', body, metadata);
    };
    /**
     * Retrieve logs for a specific property with optional filtering and pagination
     *
     * @summary Get property logs
     * @throws FetchError<400, types.GetPropertyLogsResponse400> Invalid parameters or validation error
     * @throws FetchError<404, types.GetPropertyLogsResponse404> Property not found
     */
    SDK.prototype.getPropertyLogs = function (metadata) {
        return this.core.fetch('/property-logs/{id}', 'get', metadata);
    };
    /**
     * Retrieve a list of all the photos for a property.
     *
     * @summary Retrieve all photos for a given listing.
     * @throws FetchError<403, types.GetResponse403> Unauthorized Request.
     * @throws FetchError<404, types.GetResponse404> Property not found.
     */
    SDK.prototype.get = function (metadata) {
        return this.core.fetch('/properties-api/property-photos/property-photos/{propertyId}', 'get', metadata);
    };
    /**
     * Upload new property photos using URLs. Ensure the repositories are accessible to Guesty.
     *
     * @summary Add new photos to property
     * @throws FetchError<403, types.UploadByUrlsResponse403> Unauthorized Request.
     * @throws FetchError<404, types.UploadByUrlsResponse404> Property not found.
     */
    SDK.prototype.uploadByUrls = function (body, metadata) {
        return this.core.fetch('/properties-api/property-photos/property-photos/{propertyId}', 'post', body, metadata);
    };
    /**
     * Alter the order of the existing property photos. All listed photos will be placed first,
     * and the rest will be placed at the end.
     *
     * @summary Change the photo order on a property
     * @throws FetchError<403, types.OrderResponse403> Unauthorized Request.
     * @throws FetchError<404, types.OrderResponse404> Property not found.
     */
    SDK.prototype.order = function (body, metadata) {
        return this.core.fetch('/properties-api/property-photos/property-photos/{propertyId}/order', 'post', body, metadata);
    };
    /**
     * Edit a Photo
     *
     * @summary Replace photo or edit caption without changing order or room assignment.
     * @throws FetchError<403, types.EditResponse403> Unauthorized Request.
     * @throws FetchError<404, types.EditResponse404> Property not found.
     */
    SDK.prototype.edit = function (body, metadata) {
        return this.core.fetch('/properties-api/property-photos/property-photos/{propertyId}/{photoId}', 'post', body, metadata);
    };
    /**
     * Delete a specific photo from a given property.
     *
     * @summary Delete a Photo
     * @throws FetchError<403, types.Delete1Response403> Unauthorized Request.
     * @throws FetchError<404, types.Delete1Response404> Property not found.
     */
    SDK.prototype.delete1 = function (metadata) {
        return this.core.fetch('/properties-api/property-photos/property-photos/{propertyId}/{photoId}', 'delete', metadata);
    };
    /**
     * Upload a new property photo using a file blob. Supports image files.
     *
     * @summary Upload a photo to property using file blob
     * @throws FetchError<403, types.UploadByBlobResponse403> Unauthorized Request.
     * @throws FetchError<404, types.UploadByBlobResponse404> Property not found.
     */
    SDK.prototype.uploadByBlob = function (body, metadata) {
        return this.core.fetch('/properties-api/property-photos/property-photos/{propertyId}/upload/blob', 'post', body, metadata);
    };
    /**
     * Retrieve all reservations or a filtered subset of them.
     *
     * @summary Search reservations
     * @throws FetchError<401, types.GetReservationsResponse401> Unauthorized
     * @throws FetchError<500, types.GetReservationsResponse500> Unhandled exception. Something went wrong on server.
     */
    SDK.prototype.getReservations = function (metadata) {
        return this.core.fetch('/reservations', 'get', metadata);
    };
    /**
     * Use this request to create a direct booking. **Note:** This endpoint is soon to be
     * deprecated. Please use [this
     * endpoint](https://open-api-docs.guesty.com/reference/reservationsopenapicontroller_quickbooking)
     * instead.
     *
     * @summary Create a reservation
     * @throws FetchError<400, types.PostReservationsResponse400> Bad Request
     * @throws FetchError<401, types.PostReservationsResponse401> Unauthorized
     * @throws FetchError<403, types.PostReservationsResponse403> Forbidden
     * @throws FetchError<500, types.PostReservationsResponse500> Unhandled exception. Something went wrong on server.
     */
    SDK.prototype.postReservations = function (body) {
        return this.core.fetch('/reservations', 'post', body);
    };
    /**
     * This allows you to obtain details about a specific reservation.
     *
     * NOTE:
     * - To include the check-in and check-out times of a reservations include the parameters:
     * `listing.defaultCheckInTime`, `plannedArrival`, `listing.defaultCheckOutTime` and
     * `plannedDeparture`. Planned arrival and departure times override the default times.
     * - Use `checkInDateLocalized` and `checkOutDateLocalized` to retrieve the reservation
     * according to the location of the listing.
     *
     * @summary Retrieve a reservation
     * @throws FetchError<401, types.GetReservationsIdResponse401> Unauthorized
     * @throws FetchError<403, types.GetReservationsIdResponse403> Forbidden
     * @throws FetchError<404, types.GetReservationsIdResponse404> Not Found
     * @throws FetchError<500, types.GetReservationsIdResponse500> Unhandled exception. Something went wrong on server.
     */
    SDK.prototype.getReservationsId = function (metadata) {
        return this.core.fetch('/reservations/{id}', 'get', metadata);
    };
    SDK.prototype.putReservationsId = function (body, metadata) {
        return this.core.fetch('/reservations/{id}', 'put', body, metadata);
    };
    /**
     * Use this request to create an immediate or future payment, and to add a record to
     * payment history.
     *
     * An immediate or future payment is charged using a credit card, where a rerocded payment
     * indicates the funds were collected in other methods such as bank transfer, cash, e-check
     * etc
     *
     * @summary Add a payment to reservation
     * @throws FetchError<400, types.PostReservationsIdPaymentsResponse400> Invalid Input
     * @throws FetchError<401, types.PostReservationsIdPaymentsResponse401> Unauthorized
     * @throws FetchError<403, types.PostReservationsIdPaymentsResponse403> Forbidden
     * @throws FetchError<404, types.PostReservationsIdPaymentsResponse404> Not Found
     * @throws FetchError<500, types.PostReservationsIdPaymentsResponse500> Unhandled exception. Something went wrong on server.
     */
    SDK.prototype.postReservationsIdPayments = function (body, metadata) {
        return this.core.fetch('/reservations/{id}/payments', 'post', body, metadata);
    };
    /**
     * For creating new invoice item use the <a
     * href="https://open-api-docs.guesty.com/reference/invoiceitemscontroller_createinvoiceitem">new
     * API</a>
     *
     * @summary Create new Invoice item
     * @throws FetchError<400, types.PostReservationsIdInvoiceitemsResponse400> Invalid Input
     * @throws FetchError<401, types.PostReservationsIdInvoiceitemsResponse401> Unauthorized
     * @throws FetchError<403, types.PostReservationsIdInvoiceitemsResponse403> Forbidden
     * @throws FetchError<404, types.PostReservationsIdInvoiceitemsResponse404> Not Found
     * @throws FetchError<500, types.PostReservationsIdInvoiceitemsResponse500> Unhandled exception. Something went wrong on server.
     */
    SDK.prototype.postReservationsIdInvoiceitems = function (body, metadata) {
        return this.core.fetch('/reservations/{id}/invoiceItems', 'post', body, metadata);
    };
    /**
     * Use this request to update or cancel an upcoming payment. To cancel, set the the payment
     * status to `CANCELLED`.
     *
     * @summary Update or cancel a payment for reservation
     * @throws FetchError<400, types.PutReservationsIdPaymentsPaymentidResponse400> Invalid Input
     * @throws FetchError<401, types.PutReservationsIdPaymentsPaymentidResponse401> Unauthorized
     * @throws FetchError<403, types.PutReservationsIdPaymentsPaymentidResponse403> Forbidden
     * @throws FetchError<404, types.PutReservationsIdPaymentsPaymentidResponse404> Not Found
     * @throws FetchError<500, types.PutReservationsIdPaymentsPaymentidResponse500> Unhandled exception. Something went wrong on server.
     */
    SDK.prototype.putReservationsIdPaymentsPaymentid = function (body, metadata) {
        return this.core.fetch('/reservations/{id}/payments/{paymentId}', 'put', body, metadata);
    };
    /**
     * Use this endpoint to refund a guest's payment charged on an existing reservation.
     *
     * @summary Refund an existing payment
     * @throws FetchError<401, types.PostReservationsIdPaymentsPaymentidRefundResponse401> Unauthorized
     * @throws FetchError<403, types.PostReservationsIdPaymentsPaymentidRefundResponse403> Forbidden
     * @throws FetchError<404, types.PostReservationsIdPaymentsPaymentidRefundResponse404> Not Found
     * @throws FetchError<500, types.PostReservationsIdPaymentsPaymentidRefundResponse500> Unhandled exception. Something went wrong on server.
     */
    SDK.prototype.postReservationsIdPaymentsPaymentidRefund = function (body, metadata) {
        return this.core.fetch('/reservations/{id}/payments/{paymentId}/refund', 'post', body, metadata);
    };
    /**
     * Use this endpoint to cancel a pending or recorded payment
     *
     * @summary Cancels a pending or recorded payment
     * @throws FetchError<401, types.PatchReservationsIdPaymentsPaymentidCancelResponse401> Unauthorized
     * @throws FetchError<403, types.PatchReservationsIdPaymentsPaymentidCancelResponse403> Forbidden
     * @throws FetchError<404, types.PatchReservationsIdPaymentsPaymentidCancelResponse404> Not Found
     * @throws FetchError<500, types.PatchReservationsIdPaymentsPaymentidCancelResponse500> Unhandled exception. Something went wrong on server.
     */
    SDK.prototype.patchReservationsIdPaymentsPaymentidCancel = function (metadata) {
        return this.core.fetch('/reservations/{id}/payments/{paymentId}/cancel', 'patch', metadata);
    };
    /**
     * Use this request to export a custom list of reservations as CSV file. Results are
     * limited to 500 reservations per a request.
     *
     * @summary Export as CSV
     * @throws FetchError<401, types.PostReservationsCsvResponse401> Unauthorized
     * @throws FetchError<500, types.PostReservationsCsvResponse500> Unhandled exception. Something went wrong on server.
     */
    SDK.prototype.postReservationsCsv = function (metadata) {
        return this.core.fetch('/reservations.csv', 'post', metadata);
    };
    /**
     * Use this request to export a custom list of reservations in an Email. Results are
     * limited to 250 reservations per a request.
     *
     * @summary Send results in email
     * @throws FetchError<401, types.PostReservationsEmailResponse401> Unauthorized
     * @throws FetchError<500, types.PostReservationsEmailResponse500> Unhandled exception. Something went wrong on server.
     */
    SDK.prototype.postReservationsEmail = function (body, metadata) {
        return this.core.fetch('/reservations.email', 'post', body, metadata);
    };
    /**
     * Use this call to accept a pending reservation request.
     *
     * @summary Approve a pending booking request
     * @throws FetchError<400, types.PostReservationsIdApproveResponse400> Invalid Input
     * @throws FetchError<401, types.PostReservationsIdApproveResponse401> Unauthorized
     * @throws FetchError<403, types.PostReservationsIdApproveResponse403> Forbidden
     * @throws FetchError<404, types.PostReservationsIdApproveResponse404> Not Found
     * @throws FetchError<500, types.PostReservationsIdApproveResponse500> Unhandled exception. Something went wrong on server.
     */
    SDK.prototype.postReservationsIdApprove = function (metadata) {
        return this.core.fetch('/reservations/{id}/approve', 'post', metadata);
    };
    /**
     * Use this call to deny a pending reservation request.
     *
     * @summary Decline a pending booking request
     * @throws FetchError<400, types.PostReservationsIdDeclineResponse400> Invalid Input
     * @throws FetchError<401, types.PostReservationsIdDeclineResponse401> Unauthorized
     * @throws FetchError<403, types.PostReservationsIdDeclineResponse403> Forbidden
     * @throws FetchError<404, types.PostReservationsIdDeclineResponse404> Not Found
     * @throws FetchError<500, types.PostReservationsIdDeclineResponse500> Unhandled exception. Something went wrong on server.
     */
    SDK.prototype.postReservationsIdDecline = function (metadata) {
        return this.core.fetch('/reservations/{id}/decline', 'post', metadata);
    };
    /**
     * Retrieve all populated custom fields and boolean fields with change to their default
     * state from an existing reservation.
     *
     * @summary Retrieve all populated custom fields on an existing reservation.
     * @throws FetchError<401, types.GetReservationsIdCustomFieldsResponse401> Unauthorized
     * @throws FetchError<403, types.GetReservationsIdCustomFieldsResponse403> Forbidden
     * @throws FetchError<404, types.GetReservationsIdCustomFieldsResponse404> Not Found
     * @throws FetchError<500, types.GetReservationsIdCustomFieldsResponse500> Unhandled exception. Something went wrong on server.
     */
    SDK.prototype.getReservationsIdCustomFields = function (metadata) {
        return this.core.fetch('/reservations/{id}/custom-fields', 'get', metadata);
    };
    SDK.prototype.putReservationsIdCustomFields = function (body, metadata) {
        return this.core.fetch('/reservations/{id}/custom-fields', 'put', body, metadata);
    };
    /**
     * Retrieve a specific custom field from and existing reservation.
     *
     * @summary Get custom field - Reservations
     * @throws FetchError<401, types.GetReservationsIdCustomFieldsFieldIdResponse401> Unauthorized
     * @throws FetchError<403, types.GetReservationsIdCustomFieldsFieldIdResponse403> Forbidden
     * @throws FetchError<404, types.GetReservationsIdCustomFieldsFieldIdResponse404> Not Found
     * @throws FetchError<500, types.GetReservationsIdCustomFieldsFieldIdResponse500> Unhandled exception. Something went wrong on server.
     */
    SDK.prototype.getReservationsIdCustomFieldsField_id = function (metadata) {
        return this.core.fetch('/reservations/{id}/custom-fields/{field_id}', 'get', metadata);
    };
    /**
     * Delete specific custom fields from an existing reservation.
     *
     * @summary Delete reservation's custom fields
     * @throws FetchError<401, types.DeleteReservationsReservationIdCustomFieldsFieldIdResponse401> Unauthorized
     * @throws FetchError<403, types.DeleteReservationsReservationIdCustomFieldsFieldIdResponse403> Forbidden
     * @throws FetchError<404, types.DeleteReservationsReservationIdCustomFieldsFieldIdResponse404> Not Found
     * @throws FetchError<500, types.DeleteReservationsReservationIdCustomFieldsFieldIdResponse500> Unhandled exception. Something went wrong on server.
     */
    SDK.prototype.deleteReservationsReservation_idCustomFieldsField_id = function (metadata) {
        return this.core.fetch('/reservations/{reservation_id}/custom-fields/{field_id}', 'delete', metadata);
    };
    SDK.prototype.postReservationsIdRequestCancellationSync = function (body, metadata) {
        return this.core.fetch('/reservations/{id}/request-cancellation-sync', 'post', body, metadata);
    };
    /**
     * Use this endpoint to retrieve daily calendar availability and pricing for a given
     * listing ID and date range.
     *
     * IMPORTANT: Multi-unit calendar availability is determined by unit allotment, not its
     * `status` field. To calculate if a multi-unit has availability, use the following
     * formula:
     *
     * ```
     * const isAvailable = _.isNumber(currentDay.allotment)?
     * currentDay.allotment > 0 : currentDay.status === 'available';
     * ```
     *
     * @summary Retrieve the calendar for a single listing
     * @throws FetchError<404, types.GetAvailabilityPricingApiCalendarListingsIdResponse404> Listing Not Found
     * @throws FetchError<422, types.GetAvailabilityPricingApiCalendarListingsIdResponse422> Validation Error
     * @throws FetchError<500, types.GetAvailabilityPricingApiCalendarListingsIdResponse500> Unhandled exception. Something went wrong on server.
     */
    SDK.prototype.getAvailabilityPricingApiCalendarListingsId = function (metadata) {
        return this.core.fetch('/availability-pricing/api/calendar/listings/{id}', 'get', metadata);
    };
    /**
     * Set the nightly rate, minimum stay and availability of any calendar date per listing.
     *
     * @summary Update the calendar for a single listing
     * @throws FetchError<404, types.PutAvailabilityPricingApiCalendarListingsIdResponse404> Listing Not Found
     * @throws FetchError<422, types.PutAvailabilityPricingApiCalendarListingsIdResponse422> Validation Error
     * @throws FetchError<500, types.PutAvailabilityPricingApiCalendarListingsIdResponse500> Unhandled exception. Something went wrong on server.
     */
    SDK.prototype.putAvailabilityPricingApiCalendarListingsId = function (body, metadata) {
        return this.core.fetch('/availability-pricing/api/calendar/listings/{id}', 'put', body, metadata);
    };
    /**
     * Use this endpoint to retrieve daily calendar availability and pricing for a given
     * listing ID and date range with optimized response format.
     *
     * **View Parameter Behavior:**
     * - `view=compact` (default): Returns minimal data without `blockIds` array and detailed
     * `blocks` object for better performance
     * - `view=full`: Returns complete data including `blockIds` array for each calendar day
     * and detailed `blocks` object with full block information
     *
     * IMPORTANT: Multi-unit calendar availability is determined by unit allotment, not its
     * `status` field. To calculate if a multi-unit has availability, use the following
     * formula:
     *
     * ```
     * const isAvailable = _.isNumber(currentDay.allotment)?
     * currentDay.allotment > 0 : currentDay.status === 'available';
     * ```
     *
     * @summary Retrieve the optimized calendar for a single listing
     * @throws FetchError<404, types.GetAvailabilityPricingApiCalendarListingsMinifiedListingidResponse404> Listing Not Found
     * @throws FetchError<422, types.GetAvailabilityPricingApiCalendarListingsMinifiedListingidResponse422> Validation Error
     * @throws FetchError<500, types.GetAvailabilityPricingApiCalendarListingsMinifiedListingidResponse500> Unhandled exception. Something went wrong on server.
     */
    SDK.prototype.getAvailabilityPricingApiCalendarListingsMinifiedListingid = function (metadata) {
        return this.core.fetch('/availability-pricing/api/calendar/listings/minified/{listingId}', 'get', metadata);
    };
    /**
     * Use this endpoint to retrieve calendar availability and pricing for multiple listings
     * according to a date range.
     *
     * @summary Retrieve calendars for multiple listings
     * @throws FetchError<404, types.GetAvailabilityPricingApiCalendarListingsResponse404> Listing Not Found
     * @throws FetchError<422, types.GetAvailabilityPricingApiCalendarListingsResponse422> Validation Error
     * @throws FetchError<500, types.GetAvailabilityPricingApiCalendarListingsResponse500> Unhandled exception. Something went wrong on server.
     */
    SDK.prototype.getAvailabilityPricingApiCalendarListings = function (metadata) {
        return this.core.fetch('/availability-pricing/api/calendar/listings', 'get', metadata);
    };
    /**
     * Use this endpoint to set availability and pricing for multiple listings across a range
     * of dates.
     *
     * IMPORTANT:
     * - It is strongly suggested updating a single unique listing ID in a single HTTP request,
     * despite the fact the API does support receiving different listing IDs.
     * - Max allowed days to be updated - 730 (~2 years)
     * - Strongly suggested to not update the same listing ID in parallel.
     * - To decrease response time, send fewer date periods.
     *
     * @summary Update calendar for multiple listings
     * @throws FetchError<404, types.PutAvailabilityPricingApiCalendarListingsResponse404> Listing Not Found
     * @throws FetchError<422, types.PutAvailabilityPricingApiCalendarListingsResponse422> Validation Error
     * @throws FetchError<500, types.PutAvailabilityPricingApiCalendarListingsResponse500> Unhandled exception. Something went wrong on server.
     */
    SDK.prototype.putAvailabilityPricingApiCalendarListings = function (body) {
        return this.core.fetch('/availability-pricing/api/calendar/listings', 'put', body);
    };
    /**
     * Retrieves a list of block logs based on the specified filters.
     *
     * @summary Get calendar block logs
     * @throws FetchError<400, types.CalendarLogsOpenApiControllerGetCalendarLogsResponse400> Bad Request - Invalid parameters provided
     * @throws FetchError<401, types.CalendarLogsOpenApiControllerGetCalendarLogsResponse401> Unauthorized - Authentication credentials are missing or invalid
     * @throws FetchError<403, types.CalendarLogsOpenApiControllerGetCalendarLogsResponse403> Forbidden - You do not have permission to access this resource
     * @throws FetchError<404, types.CalendarLogsOpenApiControllerGetCalendarLogsResponse404> No block logs found for this listing
     * @throws FetchError<500, types.CalendarLogsOpenApiControllerGetCalendarLogsResponse500> Internal Server Error - Something went wrong on the server
     */
    SDK.prototype.calendarLogsOpenApiController_getCalendarLogs = function (metadata) {
        return this.core.fetch('/api/block-logs', 'get', metadata);
    };
    /**
     * Create guest
     *
     * @summary Create guest
     */
    SDK.prototype.guestsOpenApiController_createGuest = function (body) {
        return this.core.fetch('/guests-crud', 'post', body);
    };
    /**
     * Get guests list
     *
     * @summary Get guests list
     */
    SDK.prototype.guestsOpenApiController_getGuestsList = function (metadata) {
        return this.core.fetch('/guests-crud', 'get', metadata);
    };
    /**
     * Update guest
     *
     * @summary Update guest
     */
    SDK.prototype.guestsOpenApiController_updateGuest = function (body, metadata) {
        return this.core.fetch('/guests-crud/{guestId}', 'put', body, metadata);
    };
    /**
     * Get guest by id
     *
     * @summary Get guest by id
     */
    SDK.prototype.guestsOpenApiController_getGuest = function (metadata) {
        return this.core.fetch('/guests-crud/{guestId}', 'get', metadata);
    };
    SDK.prototype.postGuestsIdPaymentMethods = function (body, metadata) {
        return this.core.fetch('/guests/{id}/payment-methods', 'post', body, metadata);
    };
    /**
     * Retrieve payment method list by guest id
     *
     * @summary List guest's payment methods
     */
    SDK.prototype.getGuestsIdPaymentMethods = function (metadata) {
        return this.core.fetch('/guests/{id}/payment-methods', 'get', metadata);
    };
    /**
     * Get list of owners
     *
     * @summary Get list of owners
     */
    SDK.prototype.getOwners = function (metadata) {
        return this.core.fetch('/owners', 'get', metadata);
    };
    /**
     * Create an owner
     *
     * @summary Create an owner
     */
    SDK.prototype.postOwners = function (body) {
        return this.core.fetch('/owners', 'post', body);
    };
    /**
     * Create multiple owners with assigned listings
     *
     * @summary Create multiple owners with assigned listings
     * @throws FetchError<400, types.PostOwnersBulkResponse400>
     */
    SDK.prototype.postOwnersBulk = function (body) {
        return this.core.fetch('/owners/bulk', 'post', body);
    };
    /**
     * Get owner
     *
     * @summary Get owner
     */
    SDK.prototype.getOwnersId = function (metadata) {
        return this.core.fetch('/owners/{id}', 'get', metadata);
    };
    /**
     * update owner, entered fields will be updated (support partial update)
     *
     * @summary Update owner
     */
    SDK.prototype.putOwnersId = function (body, metadata) {
        return this.core.fetch('/owners/{id}', 'put', body, metadata);
    };
    /**
     * Delete owner
     *
     * @summary Delete owner
     */
    SDK.prototype.deleteOwnersId = function (metadata) {
        return this.core.fetch('/owners/{id}', 'delete', metadata);
    };
    /**
     * Get saved replies
     *
     * @throws FetchError<403, types.GetSavedRepliesResponse403> User does not have the permissions to use this endpoint
     */
    SDK.prototype.getSavedReplies = function (metadata) {
        return this.core.fetch('/saved-replies', 'get', metadata);
    };
    /**
     * Post saved reply
     *
     * @throws FetchError<500, types.PostSavedRepliesResponse500> Error
     */
    SDK.prototype.postSavedReplies = function (body) {
        return this.core.fetch('/saved-replies', 'post', body);
    };
    /**
     * Get saved reply by id
     *
     * @throws FetchError<404, types.GetSavedRepliesReplyidResponse404> Not found
     */
    SDK.prototype.getSavedRepliesReplyid = function (metadata) {
        return this.core.fetch('/saved-replies/{replyId}', 'get', metadata);
    };
    SDK.prototype.putSavedRepliesReplyid = function (body, metadata) {
        return this.core.fetch('/saved-replies/{replyId}', 'put', body, metadata);
    };
    /**
     * Delete saved reply by id
     *
     * @throws FetchError<404, types.DeleteSavedRepliesReplyidResponse404> Not found
     */
    SDK.prototype.deleteSavedRepliesReplyid = function (metadata) {
        return this.core.fetch('/saved-replies/{replyId}', 'delete', metadata);
    };
    /**
     * Returns saved replies filtered by the listing id. By default only ids are returned.
     *
     * @summary Get saved replies by listing id
     * @throws FetchError<403, types.GetSavedRepliesListingListingidResponse403> User does not have the permissions to use this endpoint
     */
    SDK.prototype.getSavedRepliesListingListingid = function (metadata) {
        return this.core.fetch('/saved-replies/listing/{listingId}', 'get', metadata);
    };
    /**
     * Get tasks list
     *
     * @throws FetchError<403, types.GetTasksOpenApiTasksResponse403> Forbidden
     */
    SDK.prototype.getTasksOpenApiTasks = function (metadata) {
        return this.core.fetch('/tasks-open-api/tasks', 'get', metadata);
    };
    /**
     * Create a new task
     *
     * @throws FetchError<403, types.PostTasksOpenApiCreateSingleTaskResponse403> Forbidden
     */
    SDK.prototype.postTasksOpenApiCreateSingleTask = function (body) {
        return this.core.fetch('/tasks-open-api/create-single-task', 'post', body);
    };
    /**
     * Update a task
     *
     * @throws FetchError<403, types.PutTasksOpenApiTaskidResponse403> Forbidden
     */
    SDK.prototype.putTasksOpenApiTaskid = function (body, metadata) {
        return this.core.fetch('/tasks-open-api/{taskId}', 'put', body, metadata);
    };
    /**
     * Get a specific task
     *
     * @throws FetchError<403, types.GetTasksOpenApiTaskidResponse403> Forbidden
     */
    SDK.prototype.getTasksOpenApiTaskid = function (metadata) {
        return this.core.fetch('/tasks-open-api/{taskId}', 'get', metadata);
    };
    /**
     * Delete a task
     *
     * @throws FetchError<403, types.DeleteTasksOpenApiTaskidResponse403> Forbidden
     */
    SDK.prototype.deleteTasksOpenApiTaskid = function (metadata) {
        return this.core.fetch('/tasks-open-api/{taskId}', 'delete', metadata);
    };
    /**
     * Get hooks
     *
     */
    SDK.prototype.getHooks = function (metadata) {
        return this.core.fetch('/hooks', 'get', metadata);
    };
    /**
     * Post hook
     *
     */
    SDK.prototype.postHooks = function (body) {
        return this.core.fetch('/hooks', 'post', body);
    };
    /**
     * Get hook by id
     *
     */
    SDK.prototype.getHooksHookid = function (metadata) {
        return this.core.fetch('/hooks/{hookId}', 'get', metadata);
    };
    SDK.prototype.putHooksHookid = function (body, metadata) {
        return this.core.fetch('/hooks/{hookId}', 'put', body, metadata);
    };
    /**
     * Delete hook by id
     *
     */
    SDK.prototype.deleteHooksHookid = function (metadata) {
        return this.core.fetch('/hooks/{hookId}', 'delete', metadata);
    };
    /**
     * List all webhooks
     *
     * @summary List all webhooks
     */
    SDK.prototype.getWebhooks = function () {
        return this.core.fetch('/webhooks', 'get');
    };
    /**
     * Create a Webhook
     *
     */
    SDK.prototype.postWebhooks = function (body) {
        return this.core.fetch('/webhooks', 'post', body);
    };
    /**
     * Retrieve a Webhook
     *
     */
    SDK.prototype.getWebhooksId = function (metadata) {
        return this.core.fetch('/webhooks/{id}', 'get', metadata);
    };
    SDK.prototype.putWebhooksId = function (body, metadata) {
        return this.core.fetch('/webhooks/{id}', 'put', body, metadata);
    };
    /**
     * Delete webhook
     *
     */
    SDK.prototype.deleteWebhooksId = function (metadata) {
        return this.core.fetch('/webhooks/{id}', 'delete', metadata);
    };
    /**
     * Get the secret for a webhook endpoint
     *
     * @summary Get webhook secret
     */
    SDK.prototype.svixSecretApiController_getSecret = function (metadata) {
        return this.core.fetch('/webhooks-v2/secret', 'get', metadata);
    };
    /**
     * Assign listings to Stripe account
     *
     */
    SDK.prototype.postPaymentProvidersIdAssignListings = function (body, metadata) {
        return this.core.fetch('/payment-providers/{id}/assign-listings', 'post', body, metadata);
    };
    /**
     * Get summary
     *
     */
    SDK.prototype.getSummary = function () {
        return this.core.fetch('/payment-providers/summary', 'get');
    };
    /**
     * Get default payment provider
     *
     */
    SDK.prototype.getDefaultProvider = function () {
        return this.core.fetch('/payment-providers/default', 'get');
    };
    /**
     * Get provider stats
     *
     */
    SDK.prototype.getStats = function () {
        return this.core.fetch('/payment-providers/stats', 'get');
    };
    /**
     * Get payment provider by id
     *
     */
    SDK.prototype.getPaymentProvider = function (metadata) {
        return this.core.fetch('/payment-providers/{providerId}', 'get', metadata);
    };
    /**
     * Get payment provider by listing id
     *
     */
    SDK.prototype.getPaymentProviderByListing = function (metadata) {
        return this.core.fetch('/payment-providers/provider-by-listing', 'get', metadata);
    };
    /**
     * Retrieve all views
     *
     */
    SDK.prototype.getViews = function (metadata) {
        return this.core.fetch('/views', 'get', metadata);
    };
    /**
     * Create a view
     *
     */
    SDK.prototype.postViews = function (body) {
        return this.core.fetch('/views', 'post', body);
    };
    /**
     * Retrieve a view
     *
     */
    SDK.prototype.getViewsId = function (metadata) {
        return this.core.fetch('/views/{id}', 'get', metadata);
    };
    SDK.prototype.putViewsId = function (body, metadata) {
        return this.core.fetch('/views/{id}', 'put', body, metadata);
    };
    /**
     * Delete a view
     *
     */
    SDK.prototype.deleteViewsId = function (metadata) {
        return this.core.fetch('/views/{id}', 'delete', metadata);
    };
    /**
     * Get list of owner documents
     *
     * @summary Get list of owner documents
     * @throws FetchError<400, types.GetOwnersOwneridDocumentsResponse400> Bad request
     */
    SDK.prototype.getOwnersOwneridDocuments = function (metadata) {
        return this.core.fetch('/owners/{ownerId}/documents', 'get', metadata);
    };
    /**
     * Create an owner document
     *
     * @summary Create an owner document
     * @throws FetchError<400, types.PostOwnersOwneridDocumentsResponse400> Bad request
     */
    SDK.prototype.postOwnersOwneridDocuments = function (body, metadata) {
        return this.core.fetch('/owners/{ownerId}/documents', 'post', body, metadata);
    };
    /**
     * Get owner document
     *
     * @summary Get owner document
     * @throws FetchError<400, types.GetOwnersOwneridDocumentsDocumentidResponse400> Bad request
     * @throws FetchError<404, types.GetOwnersOwneridDocumentsDocumentidResponse404> Not found
     */
    SDK.prototype.getOwnersOwneridDocumentsDocumentid = function (metadata) {
        return this.core.fetch('/owners/{ownerId}/documents/{documentId}', 'get', metadata);
    };
    /**
     * Update owner document (supports partial update)
     *
     * @summary Update owner document
     * @throws FetchError<400, types.PatchOwnersOwneridDocumentsDocumentidResponse400> Bad request
     * @throws FetchError<404, types.PatchOwnersOwneridDocumentsDocumentidResponse404> Not found
     */
    SDK.prototype.patchOwnersOwneridDocumentsDocumentid = function (body, metadata) {
        return this.core.fetch('/owners/{ownerId}/documents/{documentId}', 'patch', body, metadata);
    };
    /**
     * Delete owner document
     *
     * @summary Delete owner document
     * @throws FetchError<400, types.DeleteOwnersOwneridDocumentsDocumentidResponse400> Bad request
     */
    SDK.prototype.deleteOwnersOwneridDocumentsDocumentid = function (metadata) {
        return this.core.fetch('/owners/{ownerId}/documents/{documentId}', 'delete', metadata);
    };
    /**
     * Download owner document
     *
     * @summary Download owner document
     * @throws FetchError<400, types.GetOwnersOwneridDocumentsDocumentidDownloadResponse400> Bad request
     * @throws FetchError<404, types.GetOwnersOwneridDocumentsDocumentidDownloadResponse404> Not found
     */
    SDK.prototype.getOwnersOwneridDocumentsDocumentidDownload = function (metadata) {
        return this.core.fetch('/owners/{ownerId}/documents/{documentId}/download', 'get', metadata);
    };
    /**
     * Retrieve a list of all owner reservations. This endpoint is filterable.
     *
     * @summary List owners reservations
     * @throws FetchError<401, types.GetOwnersReservationsResponse401> Unauthorized
     * @throws FetchError<500, types.GetOwnersReservationsResponse500> Unhandled exception. Something went wrong on server.
     */
    SDK.prototype.getOwnersReservations = function (metadata) {
        return this.core.fetch('/owners-reservations', 'get', metadata);
    };
    /**
     * This allows you to obtain details about a specific owner's reservation.
     *
     * @summary Retrieve an owner reservation
     * @throws FetchError<401, types.GetOwnersReservationsIdResponse401> Unauthorized
     * @throws FetchError<403, types.GetOwnersReservationsIdResponse403> Forbidden
     * @throws FetchError<404, types.GetOwnersReservationsIdResponse404> Not Found
     * @throws FetchError<500, types.GetOwnersReservationsIdResponse500> Unhandled exception. Something went wrong on server.
     */
    SDK.prototype.getOwnersReservationsId = function (metadata) {
        return this.core.fetch('/owners-reservations/{id}', 'get', metadata);
    };
    /**
     * Use this request to alter an owner's reservation.
     *
     * @summary Update an owner reservation
     * @throws FetchError<401, types.PutOwnersReservationsIdResponse401> Unauthorized
     * @throws FetchError<403, types.PutOwnersReservationsIdResponse403> Forbidden
     * @throws FetchError<500, types.PutOwnersReservationsIdResponse500> Unhandled exception. Something went wrong on server.
     */
    SDK.prototype.putOwnersReservationsId = function (body, metadata) {
        return this.core.fetch('/owners-reservations/{id}', 'put', body, metadata);
    };
    /**
     * Creates a new contact in the phonebook with the provided information.
     *
     * @summary Create a new contact
     */
    SDK.prototype.openApiContactsController_create = function (body) {
        return this.core.fetch('/contacts', 'post', body);
    };
    /**
     * Retrieves a paginated list of contacts for the authenticated user's account.
     *
     * @summary List all contacts
     */
    SDK.prototype.openApiContactsController_findAll = function (metadata) {
        return this.core.fetch('/contacts', 'get', metadata);
    };
    /**
     * Retrieves a specific contact by its ID.
     *
     * @summary Get a specific contact
     */
    SDK.prototype.openApiContactsController_findOne = function (metadata) {
        return this.core.fetch('/contacts/{contactId}', 'get', metadata);
    };
    /**
     * Updates an existing contact with the provided information.
     *
     * @summary Update a contact
     */
    SDK.prototype.openApiContactsController_update = function (body, metadata) {
        return this.core.fetch('/contacts/{contactId}', 'put', body, metadata);
    };
    /**
     * Permanently deletes a contact from the phonebook.
     *
     * @summary Delete a contact
     */
    SDK.prototype.openApiContactsController_remove = function (metadata) {
        return this.core.fetch('/contacts/{contactId}', 'delete', metadata);
    };
    /**
     * List closed airbnb resolutions for reservation.
     *
     * @summary List closed airbnb resolutions for reservation
     */
    SDK.prototype.airbnbResolutionsController_listResolutions = function (metadata) {
        return this.core.fetch('/airbnb-resolutions-center/reservations/{guestyReservationId}/resolutions', 'get', metadata);
    };
    /**
     * Upsert listing expectations for Airbnb channel by Guesty listing ID.
     *
     * @summary Upsert Airbnb listing expectations
     * @throws FetchError<400, types.ListingExpectationsControllerUpsertListingExpectationsResponse400> The provided input data is invalid
     * @throws FetchError<401, types.ListingExpectationsControllerUpsertListingExpectationsResponse401> Unauthorized
     * @throws FetchError<404, types.ListingExpectationsControllerUpsertListingExpectationsResponse404> Resource is not found
     */
    SDK.prototype.listingExpectationsController_upsertListingExpectations = function (body, metadata) {
        return this.core.fetch('/airbnb-resource-service/listing-expectations/{id}', 'put', body, metadata);
    };
    /**
     * Get listing expectations for Airbnb channel by Guesty listing ID.
     *
     * @summary Retrieve Airbnb listing expectations
     * @throws FetchError<401, types.ListingExpectationsControllerGetListingExpectationsResponse401> Unauthorized
     * @throws FetchError<404, types.ListingExpectationsControllerGetListingExpectationsResponse404> Resource is not found
     */
    SDK.prototype.listingExpectationsController_getListingExpectations = function (metadata) {
        return this.core.fetch('/airbnb-resource-service/listing-expectations/{id}', 'get', metadata);
    };
    /**
     * Get folio balances by reservation ID.
     *         For each reservation get the accounting folio balances per ledger.
     *         Balances represent current and future entries.
     *
     * @summary Get folio balances
     * @throws FetchError<403, types.ReservationsControllerFolioBalancesResponse403> You do not have sufficient permissions to access this resource
     * @throws FetchError<404, types.ReservationsControllerFolioBalancesResponse404> Can't find reservation, by provided ID
     * @throws FetchError<500, types.ReservationsControllerFolioBalancesResponse500> Unhandled exception. Something went wrong on server
     */
    SDK.prototype.reservationsController_folioBalances = function (metadata) {
        return this.core.fetch('/accounting-api/reservations/{id}/balance', 'get', metadata);
    };
    /**
     * Get journal entries
     *
     * @summary Get journal entries
     * @throws FetchError<400, types.JournalEntriesControllerListResponse400> Payload validation failed
     * @throws FetchError<403, types.JournalEntriesControllerListResponse403> Accounting feature flow disabled
     * @throws FetchError<500, types.JournalEntriesControllerListResponse500> Unhandled exception. Something went wrong on server
     */
    SDK.prototype.journalEntriesController_list = function (metadata) {
        return this.core.fetch('/accounting-api/journal-entries', 'get', metadata);
    };
    /**
     * Get latest owner working capital by owner ID.
     *
     * @summary Get owner working capital
     * @throws FetchError<403, types.OwnersControllerRetrieveResponse403> You do not have sufficient permissions to access this resource
     * @throws FetchError<404, types.OwnersControllerRetrieveResponse404> Can't find owner, by provided ID
     * @throws FetchError<500, types.OwnersControllerRetrieveResponse500> Unhandled exception. Something went wrong on server
     */
    SDK.prototype.ownersController_retrieve = function (metadata) {
        return this.core.fetch('/accounting-api/owners/{id}/working-capital', 'get', metadata);
    };
    /**
     * Update owner working capital by owner ID.
     *
     * @summary Update owner working capital
     * @throws FetchError<400, types.OwnersControllerUpdateResponse400> Input data is not valid.
     * @throws FetchError<403, types.OwnersControllerUpdateResponse403> You do not have sufficient permissions to access this resource
     * @throws FetchError<500, types.OwnersControllerUpdateResponse500> Unhandled exception. Something went wrong on server
     */
    SDK.prototype.ownersController_update = function (body, metadata) {
        return this.core.fetch('/accounting-api/owners/{id}/working-capital', 'put', body, metadata);
    };
    /**
     * Retrieve a paginated list of categories with optional filtering.
     *         Supports filtering by name.
     *
     * @summary Get categories list
     * @throws FetchError<400, types.CategoriesControllerGetCategoriesResponse400> Invalid query parameters provided
     * @throws FetchError<403, types.CategoriesControllerGetCategoriesResponse403> You do not have sufficient permissions to access this resource
     * @throws FetchError<500, types.CategoriesControllerGetCategoriesResponse500> Unhandled exception. Something went wrong on server
     */
    SDK.prototype.categoriesController_getCategories = function (metadata) {
        return this.core.fetch('/accounting-api/categories', 'get', metadata);
    };
    /**
     * Assign provided listings to appropriate Business model
     *
     * @summary Assign listings to Business Models
     * @throws FetchError<400, types.AssignListingControllerUpdateResponse400> Input data is not valid
     * @throws FetchError<403, types.AssignListingControllerUpdateResponse403> You do not have sufficient permissions to access this resource
     * @throws FetchError<404, types.AssignListingControllerUpdateResponse404> Can't find business model, by provided ID
     * @throws FetchError<500, types.AssignListingControllerUpdateResponse500> Unhandled exception. Something went wrong on server
     */
    SDK.prototype.assignListingController_update = function (body, metadata) {
        return this.core.fetch('/business-models-api/assignment/{businessModelId}', 'put', body, metadata);
    };
    /**
     * Get list of Business Models by accountId
     *
     * @summary Get Business Models
     * @throws FetchError<400, types.BusinessModelsOaControllerIndexResponse400> Input data is not valid
     * @throws FetchError<403, types.BusinessModelsOaControllerIndexResponse403> You do not have sufficient permissions to access this resource
     * @throws FetchError<404, types.BusinessModelsOaControllerIndexResponse404> Can't find business model, by provided accountId
     * @throws FetchError<500, types.BusinessModelsOaControllerIndexResponse500> Unhandled exception. Something went wrong on server
     */
    SDK.prototype.businessModelsOAController_index = function (metadata) {
        return this.core.fetch('/business-models-api/light-business-models', 'get', metadata);
    };
    /**
     * Create charge for provided owner.
     *
     * @summary Create owner charge per owner
     * @throws FetchError<400, types.TransactionsControllerCreateChargeResponse400> Input data is not valid.
     * @throws FetchError<403, types.TransactionsControllerCreateChargeResponse403> Accounting feature flow disabled
     * @throws FetchError<500, types.TransactionsControllerCreateChargeResponse500> Unhandled exception. Something went wrong on server
     */
    SDK.prototype.transactionsController_createCharge = function (body) {
        return this.core.fetch('/business-models-api/transactions/owner-charges', 'post', body);
    };
    /**
     * Create an owner charge for the provided listing. This will apply to all owners unless
     * you include a given ownerId.
     *
     * @summary Create owner charges by listing
     * @throws FetchError<400, types.TransactionsControllerCreateChargeByListingResponse400> Input data is not valid.
     * @throws FetchError<403, types.TransactionsControllerCreateChargeByListingResponse403> Accounting feature flow disabled
     * @throws FetchError<500, types.TransactionsControllerCreateChargeByListingResponse500> Unhandled exception. Something went wrong on server
     */
    SDK.prototype.transactionsController_createChargeByListing = function (body) {
        return this.core.fetch('/business-models-api/transactions/owner-charges-by-listing', 'post', body);
    };
    /**
     * Create expense for provided vendor. The expense will be created only for the specified
     * owner and will not be split between all the listing ownerships.
     *
     * @summary Create expense
     * @throws FetchError<400, types.TransactionsControllerCreateExpenseResponse400> Input data is not valid
     * @throws FetchError<403, types.TransactionsControllerCreateExpenseResponse403> Accounting feature flow disabled
     * @throws FetchError<500, types.TransactionsControllerCreateExpenseResponse500> Unhandled exception. Something went wrong on server
     */
    SDK.prototype.transactionsController_createExpense = function (body) {
        return this.core.fetch('/business-models-api/transactions/expenses', 'post', body);
    };
    /**
     * Create an expense for the provided listing. This will apply to all owners unless you
     * include a given ownerId.
     *
     * @summary Create expense by listing
     * @throws FetchError<400, types.TransactionsControllerCreateExpenseByListingResponse400> Input data is not valid
     * @throws FetchError<403, types.TransactionsControllerCreateExpenseByListingResponse403> Accounting feature flow disabled
     * @throws FetchError<500, types.TransactionsControllerCreateExpenseByListingResponse500> Unhandled exception. Something went wrong on server
     */
    SDK.prototype.transactionsController_createExpenseByListing = function (body) {
        return this.core.fetch('/business-models-api/transactions/expenses-by-listing', 'post', body);
    };
    /**
     * Get conversations
     *
     * @summary Get conversations
     * @throws FetchError<500, types.GetCommunicationConversationsResponse500> Internal Server Error
     */
    SDK.prototype.getCommunicationConversations = function (metadata) {
        return this.core.fetch('/communication/conversations', 'get', metadata);
    };
    /**
     * Get conversation by id
     *
     * @throws FetchError<500, types.GetCommunicationConversationsConversationidResponse500> Internal Server Error
     */
    SDK.prototype.getCommunicationConversationsConversationid = function (metadata) {
        return this.core.fetch('/communication/conversations/{conversationId}', 'get', metadata);
    };
    /**
     * Get posts (by conversation id)
     *
     * @throws FetchError<500, types.GetCommunicationConversationsConversationidPostsResponse500> Internal Server Error
     */
    SDK.prototype.getCommunicationConversationsConversationidPosts = function (metadata) {
        return this.core.fetch('/communication/conversations/{conversationId}/posts', 'get', metadata);
    };
    /**
     * Post msg to conversation without sending it
     *
     */
    SDK.prototype.postCommunicationConversationsConversationidPosts = function (body, metadata) {
        return this.core.fetch('/communication/conversations/{conversationId}/posts', 'post', body, metadata);
    };
    /**
     * Owners conversations do not support airbnb2 module type, messages that sent with
     * platform module type will be sent through Email.
     *
     * @summary Post msg(Send new msg)
     */
    SDK.prototype.postCommunicationConversationsConversationidSendMessage = function (body, metadata) {
        return this.core.fetch('/communication/conversations/{conversationId}/send-message', 'post', body, metadata);
    };
    /**
     * Use to define on which level the taxes are defined for a specific unit type.
     *
     * @summary Create or update tax level configuration
     */
    SDK.prototype.taxesLevelConfigurationsController_upsertTaxesLevelConfigurationsOpenApi = function (body) {
        return this.core.fetch('/taxes/level-configurations', 'put', body);
    };
    /**
     * Get tax level configuration
     *
     * @summary Get tax level configuration
     */
    SDK.prototype.taxesLevelConfigurationsController_getUnitTypeTaxesLevelConfigurations = function (metadata) {
        return this.core.fetch('/taxes/level-configurations/unit-type/{id}', 'get', metadata);
    };
    /**
     * Create tax configuration with the provided settings.
     *
     * @summary Create tax
     */
    SDK.prototype.openApiTaxesController_createTax = function (body) {
        return this.core.fetch('/taxes', 'post', body);
    };
    /**
     * Delete tax by id.
     *
     * @summary Delete tax
     */
    SDK.prototype.openApiTaxesController_deleteTax = function (metadata) {
        return this.core.fetch('/taxes/{id}', 'delete', metadata);
    };
    /**
     * Update tax by id.
     *
     * @summary Update tax
     */
    SDK.prototype.openApiTaxesController_updateTax = function (body, metadata) {
        return this.core.fetch('/taxes/{id}', 'patch', body, metadata);
    };
    /**
     * Get account level taxes
     *
     * @summary Get account level taxes
     */
    SDK.prototype.openApiTaxesController_getAccountLevelTaxes = function () {
        return this.core.fetch('/taxes/account', 'get');
    };
    /**
     * Get unit type (parent unit) level taxes
     *
     * @summary Get unit type (parent unit) level taxes
     */
    SDK.prototype.openApiTaxesController_getUnitTypeLevelTaxes = function (metadata) {
        return this.core.fetch('/taxes/unit-type/{id}', 'get', metadata);
    };
    /**
     * Get actual taxes of unit type (parent unit level)
     *
     * @summary Get actual taxes of unit type (parent unit level)
     */
    SDK.prototype.openApiTaxesController_getUnitTypeActualTaxes = function (metadata) {
        return this.core.fetch('/taxes/unit-type/{id}/actual', 'get', metadata);
    };
    /**
     * Use to create a manual price adjustments (increase or decrease) for a reservation.
     *
     * @summary Create a total amount price adjustments
     */
    SDK.prototype.priceAdjustmentsController_createManualPriceAdjustments = function (body) {
        return this.core.fetch('/price-adjustments/manual-total-amount', 'post', body);
    };
    /**
     * Get all total amount price adjustments for a reservation
     *
     * @summary Get all total amount price adjustments for a reservation
     */
    SDK.prototype.priceAdjustmentsController_getAllTotalAmountPriceAdjustment = function (metadata) {
        return this.core.fetch('/price-adjustments/total-amount/{id}', 'get', metadata);
    };
    /**
     * This endpoint allows you to send Guesty an updated amount for channel commissions.
     * Providing an amount to an existing integration object or manual source will update its
     * channel commission value. If the integration object or manual source do not exist, they
     * will be added.
     *
     * example for bookingCom: { bookingCom: {tax: 10, commission: {value: 5, of:
     * ["ACCOMMODATION_FARE"]}}}
     *
     *
     * Applying your channel commission on fees & taxes is currently in beta.
     *
     * @summary Update account channel commission
     */
    SDK.prototype.channelCommissionController_updateAccountChannelCommission = function (body) {
        return this.core.fetch('/channel-commission/account', 'put', body);
    };
    /**
     * Get account channel commission.
     *
     * @summary Get account channel commission
     */
    SDK.prototype.channelCommissionController_getAccountChannelCommission = function () {
        return this.core.fetch('/channel-commission/account', 'get');
    };
    /**
     * This endpoint allows you to send Guesty an updated amount for channel commissions.
     * Providing an amount to an existing integration object or manual source will update its
     * channel commission value. If the integration object or manual source do not exist, they
     * will be added.
     *
     *
     * example for bookingCom: {channelCommissions: [{listingId: "923892d53f4f56cfcb25586d",
     * bookingCom: {tax: 10, commission: {value: 5, of: ["ACCOMMODATION_FARE"]}}}]}
     *
     *
     * Applying your channel commission on fees & taxes is currently in beta.
     *
     * @summary Update listings channel commission
     */
    SDK.prototype.channelCommissionController_updateListingsChannelCommission = function (body) {
        return this.core.fetch('/channel-commission/listings', 'put', body);
    };
    /**
     * Get channel commission from multiple listings.
     *
     * @summary Get listings channel commission
     */
    SDK.prototype.channelCommissionController_getListingsChannelCommission = function (metadata) {
        return this.core.fetch('/channel-commission/listings', 'get', metadata);
    };
    /**
     * This endpoint allows you to send Guesty an updated amount for channel commissions.
     * Providing an amount to an existing integration object or manual source will update its
     * channel commission value. If the integration object or manual source do not exist, they
     * will be added.
     *
     * example for bookingCom: { bookingCom: {tax: 10, commission: {value: 5, of:
     * ["ACCOMMODATION_FARE"]}}}
     *
     *
     * Applying your channel commission on fees & taxes is currently in beta.
     *
     * @summary Update account channel commission
     */
    SDK.prototype.channelCommissionController_updateAccountChannelCommission1 = function (body) {
        return this.core.fetch('/channel-commissions-v2/account', 'put', body);
    };
    /**
     * Get account channel commission.
     *
     * @summary Get account channel commission
     */
    SDK.prototype.channelCommissionController_getAccountChannelCommission1 = function () {
        return this.core.fetch('/channel-commissions-v2/account', 'get');
    };
    /**
     * This endpoint allows you to send Guesty an updated amount for channel commissions.
     * Providing an amount to an existing integration object or manual source will update its
     * channel commission value. If the integration object or manual source do not exist, they
     * will be added.
     *
     *
     * example for bookingCom: {channelCommissions: [{listingId: "923892d53f4f56cfcb25586d",
     * bookingCom: {tax: 10, commission: {value: 5, of: ["ACCOMMODATION_FARE"]}}}]}
     *
     *
     * Applying your channel commission on fees & taxes is currently in beta.
     *
     * @summary Update listings channel commission
     */
    SDK.prototype.channelCommissionController_updateListingsChannelCommission1 = function (body) {
        return this.core.fetch('/channel-commissions-v2/listings', 'put', body);
    };
    /**
     * Get channel commission from multiple listings.
     *
     * @summary Get listings channel commission
     */
    SDK.prototype.channelCommissionController_getListingsChannelCommission1 = function (metadata) {
        return this.core.fetch('/channel-commissions-v2/listings', 'get', metadata);
    };
    /**
     * Create Invoice Item
     *
     * @summary Create Invoice Item
     */
    SDK.prototype.invoiceItemsController_createInvoiceItem = function (body, metadata) {
        return this.core.fetch('/invoice-items/reservation/{reservationId}', 'post', body, metadata);
    };
    /**
     * Get url and filename of the check-in form summary. Url is valid for 1 hour.
     *
     * @summary Get check-in form summary by reservation id
     */
    SDK.prototype.guestAppOpenApiController_getCifSummaryDetails = function (metadata) {
        return this.core.fetch('/guest-app-api/guest-app-runtime/{reservationId}/module/{moduleType}/summary', 'get', metadata);
    };
    /**
     * To retrieve data for a specific imported calendar,
     *       including iCalendar name, URL, state & events adjustment,
     *       use the following request
     *
     * @summary Get imported calendar by id
     * @throws FetchError<404, types.ImportedCalendarOpenApiControllerGetImportedCalendarByIdResponse404> Imported calendar not found
     */
    SDK.prototype.importedCalendarOpenApiController_getImportedCalendarById = function (metadata) {
        return this.core.fetch('/icalendar-api/imported-calendars/{importedCalendarId}', 'get', metadata);
    };
    /**
     * If any adjustments are made to the values, the import sync process will be automatically
     * triggered.
     *       You can use this request to update the URL, name, or events adjustment of a
     * specific imported calendar ID.
     *       To pause or resume the import process, navigate to "Pause/Resume Imported-Calendar
     * Sync."
     *       Please note that you can only update the allowed properties that are listed below.
     *
     * @summary Update imported calendar
     * @throws FetchError<404, types.ImportedCalendarOpenApiControllerUpdateImportedCalendarResponse404> Listing not found
     */
    SDK.prototype.importedCalendarOpenApiController_updateImportedCalendar = function (body, metadata) {
        return this.core.fetch('/icalendar-api/imported-calendars/{importedCalendarId}', 'put', body, metadata);
    };
    /**
     * You can remove imported calendar with one of the following behaviors (strategies)
     * regarding existing imported events.
     *
     * @summary Delete imported calendar
     * @throws FetchError<404, types.ImportedCalendarOpenApiControllerDeleteImportedCalendarResponse404> Imported calendar not found
     */
    SDK.prototype.importedCalendarOpenApiController_deleteImportedCalendar = function (metadata) {
        return this.core.fetch('/icalendar-api/imported-calendars/{importedCalendarId}', 'delete', metadata);
    };
    /**
     * To retrieve a list of all imported calendars, use the following request.
     *
     * @summary Get imported calendars list
     * @throws FetchError<404, types.ImportedCalendarOpenApiControllerGetImportedCalendarsResponse404> Listing not found
     */
    SDK.prototype.importedCalendarOpenApiController_getImportedCalendars = function (metadata) {
        return this.core.fetch('/icalendar-api/imported-calendars', 'get', metadata);
    };
    /**
     * To import external calendar events into Guesty Calendar via the iCalendar link,
     *       you must first create an imported-calendar entity.
     *       This entity stores the import settings, such as the URL, calendar name, state, and
     * events adjustment.
     *       Once the entity is created, the import sync process will be initiated.
     *
     * @summary Import a calendar
     * @throws FetchError<404, types.ImportedCalendarOpenApiControllerCreateImportedCalendarResponse404> Listing not found
     */
    SDK.prototype.importedCalendarOpenApiController_createImportedCalendar = function (body) {
        return this.core.fetch('/icalendar-api/imported-calendars', 'post', body);
    };
    /**
     * You can manually pause or resume the import process with the following requests.
     *     Once the imported calendar is resumed, the import sync process will be triggered.
     *
     * @summary Unsync imported calendar
     * @throws FetchError<404, types.ImportedCalendarOpenApiControllerPauseImportedCaledarResponse404> Listing not found
     */
    SDK.prototype.importedCalendarOpenApiController_pauseImportedCaledar = function (metadata) {
        return this.core.fetch('/icalendar-api/imported-calendars/{importedCalendarId}/pause', 'post', metadata);
    };
    /**
     * You can manually pause or resume the import process with the following requests.
     *       Once the imported calendar is resumed, the import sync process will be triggered.
     *
     * @summary Resume imported calendar sync
     * @throws FetchError<404, types.ImportedCalendarOpenApiControllerResumeImportedCaledarResponse404> Listing not found
     */
    SDK.prototype.importedCalendarOpenApiController_resumeImportedCaledar = function (metadata) {
        return this.core.fetch('/icalendar-api/imported-calendars/{importedCalendarId}/resume', 'post', metadata);
    };
    /**
     * When you export your Guesty calendar to an external service,
     *     the events from the Guesty calendar will block the external calendar.
     *     You must create an exported calendar entity to export data from Guesty via the
     * iCalendar link.
     *     This entity stores the settings used during the export process, such as the URL,
     * state, and adjustments.
     *     Once the entity is created, the export sync process will be triggered.
     *     Please note that you can only have one exported calendar per listing.
     *     After posting your request, you will receive an exported calendar descriptor, which
     * includes the URL property.
     *     You will use this URL in your other services to pull data from Guesty.
     *
     * @summary Create exported calendar link
     * @throws FetchError<404, types.ExportedCalendarOpenApiControllerCreateExportedCalendarResponse404> Listing not found
     */
    SDK.prototype.exportedCalendarOpenApiController_createExportedCalendar = function (body) {
        return this.core.fetch('/icalendar-api/exported-calendars', 'post', body);
    };
    /**
     * Any listing can have only 1 exported calendar, composed by Guesty.
     *     You can use the following request to retrieve an active exported-calendar for a
     * specified listing.
     *     Please, note, the response body will contain either an empty list, or a list with a
     * single item - the exported calendar itself.
     *     You can use this endpoint to get currently active exported calendar, if you do not
     * have its id.
     *
     * @summary Get active exported calendar
     * @throws FetchError<404, types.ExportedCalendarOpenApiControllerGetExportedCalendarResponse404> Listing not found
     */
    SDK.prototype.exportedCalendarOpenApiController_getExportedCalendar = function (metadata) {
        return this.core.fetch('/icalendar-api/exported-calendars', 'get', metadata);
    };
    /**
     * Should return the state of an exported calendar entity by its id.
     *     If an exported calendar was removed, you will receive an error.
     *
     * @summary Get a specific exported calendar
     * @throws FetchError<404, types.ExportedCalendarOpenApiControllerGetExportedCalendarByIdResponse404> Exported calendar not found
     */
    SDK.prototype.exportedCalendarOpenApiController_getExportedCalendarById = function (metadata) {
        return this.core.fetch('/icalendar-api/exported-calendars/{exportedCalendarId}', 'get', metadata);
    };
    /**
     * If adjustment values are updated, the export sync process will be triggered.
     *     Use this request to update events adjustment of your exported Guesty calendar.
     *     Please note you can update only the parameters listed below.
     *
     * @summary Update exported calendar
     * @throws FetchError<404, types.ExportedCalendarOpenApiControllerUpdateExportedCalendarResponse404> Exported calendar not found
     */
    SDK.prototype.exportedCalendarOpenApiController_updateExportedCalendar = function (body, metadata) {
        return this.core.fetch('/icalendar-api/exported-calendars/{exportedCalendarId}', 'put', body, metadata);
    };
    /**
     * Keep in mind - when you remove an exported calendar, any services that use its URL will
     * encounter a 404 error.
     *     To permanently delete the exported calendar, use the following request.
     *
     * @summary Delete exported calendar
     * @throws FetchError<404, types.ExportedCalendarOpenApiControllerDeleteExportedCalendarResponse404> Exported calendar not found
     */
    SDK.prototype.exportedCalendarOpenApiController_deleteExportedCalendar = function (metadata) {
        return this.core.fetch('/icalendar-api/exported-calendars/{exportedCalendarId}', 'delete', metadata);
    };
    /**
     * List bed-types
     *
     */
    SDK.prototype.getPropertiesSpacesBedTypes = function () {
        return this.core.fetch('/properties/spaces/bed-types', 'get');
    };
    /**
     * List room-types
     *
     */
    SDK.prototype.getPropertiesSpacesRoomTypes = function () {
        return this.core.fetch('/properties/spaces/room-types', 'get');
    };
    /**
     * Retrieve spaces for a unit-type
     *
     */
    SDK.prototype.getPropertiesSpacesUnitTypeUnittypeid = function (metadata) {
        return this.core.fetch('/properties/spaces/unit-type/{unitTypeId}', 'get', metadata);
    };
    /**
     * Retrieve spaces for a complex
     *
     */
    SDK.prototype.getPropertiesSpacesComplexComplexid = function (metadata) {
        return this.core.fetch('/properties/spaces/complex/{complexId}', 'get', metadata);
    };
    SDK.prototype.postPropertiesSpacesUnitTypeUnittypeidAdd = function (body, metadata) {
        return this.core.fetch('/properties/spaces/unit-type/{unitTypeId}/add', 'post', body, metadata);
    };
    SDK.prototype.patchPropertiesSpacesSpaceSpaceidDetails = function (body, metadata) {
        return this.core.fetch('/properties/spaces/space/{spaceId}/details', 'patch', body, metadata);
    };
    /**
     * Remove space from unit-type
     *
     */
    SDK.prototype.postPropertiesSpacesSpaceSpaceidRemove = function (metadata) {
        return this.core.fetch('/properties/spaces/space/{spaceId}/remove', 'post', metadata);
    };
    SDK.prototype.postPropertiesSpacesSpaceSpaceidEdit = function (body, metadata) {
        return this.core.fetch('/properties/spaces/space/{spaceId}/edit', 'post', body, metadata);
    };
    /**
     * Retrieve unit-type house-rules
     *
     */
    SDK.prototype.getPropertiesHouseRulesUnitTypeUnittypeid = function (metadata) {
        return this.core.fetch('/properties/house-rules/unit-type/{unitTypeId}', 'get', metadata);
    };
    SDK.prototype.putPropertiesHouseRulesUnitTypeUnittypeid = function (body, metadata) {
        return this.core.fetch('/properties/house-rules/unit-type/{unitTypeId}', 'put', body, metadata);
    };
    /**
     * List house rules
     *
     */
    SDK.prototype.getPropertiesHouseRules = function (metadata) {
        return this.core.fetch('/properties/house-rules/', 'get', metadata);
    };
    /**
     * Update multiple unit-type house-rules
     *
     */
    SDK.prototype.postPropertiesHouseRules = function (body) {
        return this.core.fetch('/properties/house-rules/', 'post', body);
    };
    /**
     * Get a list of all complexes, including their IDs, titles, nicknames, propertyIds, and
     * tags
     *
     * @summary Get a list of all complexes
     * @throws FetchError<403, types.GetAllComplexesResponse403> Unauthorized Request
     * @throws FetchError<404, types.GetAllComplexesResponse404> No Complexs were found
     */
    SDK.prototype.getAllComplexes = function () {
        return this.core.fetch('/properties-api/complexes', 'get');
    };
    /**
     * Create a new complex and return the ID of the newly created complex
     *
     * @summary Create a new complex
     * @throws FetchError<400, types.AddComplexResponse400> Bad Request
     * @throws FetchError<403, types.AddComplexResponse403> Unauthorized Request
     * @throws FetchError<404, types.AddComplexResponse404> Complex not found
     */
    SDK.prototype.addComplex = function (body) {
        return this.core.fetch('/properties-api/complexes', 'post', body);
    };
    /**
     * Get a specific complex based on the complexId
     *
     * @summary Get complex
     * @throws FetchError<403, types.ComplexesControllerGetComplexByIdResponse403> Unauthorized Request
     * @throws FetchError<404, types.ComplexesControllerGetComplexByIdResponse404> Complex not found
     */
    SDK.prototype.complexesController_getComplexById = function (metadata) {
        return this.core.fetch('/properties-api/complexes/{id}', 'get', metadata);
    };
    /**
     * Updates the details of a specific complex based on the complexId, and returns the
     * modified values
     *
     * @summary Update complex details
     * @throws FetchError<403, types.ComplexesControllerUpdateComplexDetailsResponse403> Unauthorized Request
     * @throws FetchError<404, types.ComplexesControllerUpdateComplexDetailsResponse404> Complex not found
     */
    SDK.prototype.complexesController_updateComplexDetails = function (body, metadata) {
        return this.core.fetch('/properties-api/complexes/{id}', 'put', body, metadata);
    };
    /**
     * Deletes a specific complex based on the complexId
     *
     * @summary Delete complex
     * @throws FetchError<403, types.ComplexesControllerRemoveComplexResponse403> Unauthorized Request
     * @throws FetchError<404, types.ComplexesControllerRemoveComplexResponse404> Complex not found
     */
    SDK.prototype.complexesController_removeComplex = function (metadata) {
        return this.core.fetch('/properties-api/complexes/{id}', 'delete', metadata);
    };
    /**
     * Assign propertyIds to a specific complex based on the complexId, and returns the
     * assigned values
     *
     * @summary Assign propertyIds to a complex
     * @throws FetchError<403, types.ComplexesControllerAssignComplexPropertyIdsResponse403> Unauthorized Request
     * @throws FetchError<404, types.ComplexesControllerAssignComplexPropertyIdsResponse404> Complex not found
     */
    SDK.prototype.complexesController_assignComplexPropertyIds = function (body, metadata) {
        return this.core.fetch('/properties-api/complexes/{id}/assign', 'put', body, metadata);
    };
    /**
     * Unassign propertyIds from a specific complex based on the complexId, and returns the
     * unassigned values
     *
     * @summary Un-Assign propertyIds from a complex
     * @throws FetchError<403, types.ComplexesControllerUnassignComplexPropertyIdsResponse403> Unauthorized Request
     * @throws FetchError<404, types.ComplexesControllerUnassignComplexPropertyIdsResponse404> Complex not found
     */
    SDK.prototype.complexesController_unassignComplexPropertyIds = function (body, metadata) {
        return this.core.fetch('/properties-api/complexes/{id}/unassign', 'put', body, metadata);
    };
    /**
     * Get a list of all supported amenities, including their names, groups and channels
     *
     * @summary Get a List of All Supported Amenities
     * @throws FetchError<403, types.GetSupportedAmenitiesResponse403> Unauthorized Request
     */
    SDK.prototype.getSupportedAmenities = function () {
        return this.core.fetch('/properties-api/amenities/supported', 'get');
    };
    /**
     * Get a list of all available amenity groups
     *
     * @summary Get a List Of All Available Amenity Groups
     * @throws FetchError<403, types.GetAmenitiesGroupsResponse403> Unauthorized Request
     */
    SDK.prototype.getAmenitiesGroups = function () {
        return this.core.fetch('/properties-api/amenities/groups', 'get');
    };
    /**
     * Retrieve a property's amenities.
     *
     * @summary Retrieve Property Amenities
     * @throws FetchError<403, types.AmenitiesControllerGetForUnitTypeResponse403> Unauthorized Request
     * @throws FetchError<404, types.AmenitiesControllerGetForUnitTypeResponse404> Amenities not found
     */
    SDK.prototype.amenitiesController_getForUnitType = function (metadata) {
        return this.core.fetch('/properties-api/amenities/{propertyId}', 'get', metadata);
    };
    /**
     * Set selected amenities list to the property
     *
     * @summary Set Amenities For Property
     * @throws FetchError<400, types.AmenitiesControllerSetAmenitiesForPropertyResponse400> Only MTL and SINGLE property types are supported
     * @throws FetchError<403, types.AmenitiesControllerSetAmenitiesForPropertyResponse403> Unauthorized Request
     * @throws FetchError<404, types.AmenitiesControllerSetAmenitiesForPropertyResponse404> Unit type not found
     */
    SDK.prototype.amenitiesController_setAmenitiesForProperty = function (body, metadata) {
        return this.core.fetch('/properties-api/amenities/{propertyId}', 'put', body, metadata);
    };
    /**
     * Retrieve a list of all room photo mappings for each property, including photo ID, space
     * ID, and photo URL.
     *
     * @summary List All Room Photos per Property
     * @throws FetchError<403, types.GetRoomPhotosByPropertyIdResponse403> Unauthorized Request.
     * @throws FetchError<404, types.GetRoomPhotosByPropertyIdResponse404> Property not found.
     */
    SDK.prototype.getRoomPhotosByPropertyId = function (metadata) {
        return this.core.fetch('/properties-api/room-photos/property/{propertyId}', 'get', metadata);
    };
    /**
     * Assigns the selected photo to a space.
     *
     * @summary Assign a Photo to a Space
     * @throws FetchError<403, types.RoomPhotosControllerAssignRoomPhotoResponse403> Unauthorized Request.
     * @throws FetchError<404, types.RoomPhotosControllerAssignRoomPhotoResponse404> Property not found.
     */
    SDK.prototype.roomPhotosController_assignRoomPhoto = function (body, metadata) {
        return this.core.fetch('/properties-api/room-photos/photos/{photoId}/assign', 'put', body, metadata);
    };
    /**
     * Removes the selected photo from the designated space.
     *
     * @summary Unassign a Photo from a Space
     * @throws FetchError<403, types.RoomPhotosControllerUnassignRoomPhotoResponse403> Unauthorized Request.
     * @throws FetchError<404, types.RoomPhotosControllerUnassignRoomPhotoResponse404> Property not found.
     */
    SDK.prototype.roomPhotosController_unassignRoomPhoto = function (body, metadata) {
        return this.core.fetch('/properties-api/room-photos/photos/{photoId}/unassign', 'put', body, metadata);
    };
    /**
     * Get a room photo mapping for a photo, including photo id, space id and photo URL
     *
     * @summary Retrieve a Room Photo by ID
     * @throws FetchError<403, types.Get1Response403> Unauthorized Request.
     * @throws FetchError<404, types.Get1Response404> Photo not found.
     */
    SDK.prototype.get1 = function (metadata) {
        return this.core.fetch('/properties-api/room-photos/photos/{photoId}', 'get', metadata);
    };
    /**
     * Retrieve a list of translation fields for a specific language slug or all languages
     *
     * @summary Get a list of translation fields
     * @throws FetchError<404, types.GetFieldsResponse404> Not Found
     */
    SDK.prototype.getFields = function (metadata) {
        return this.core.fetch('/marketing/fields/{id}', 'get', metadata);
    };
    /**
     * Get a list of translation fields for a specific language slug or all languages per
     * channel.
     *
     * @summary [Beta] Get a list of translation fields per channel
     * @throws FetchError<404, types.GetFieldsPerChannelResponse404> Not Found
     */
    SDK.prototype.getFieldsPerChannel = function (metadata) {
        return this.core.fetch('/marketing/fields/{id}/channels/{channel}', 'get', metadata);
    };
    /**
     * Get a list of translation fields for a specific language slug or all languages per
     * description set.
     *
     * @summary [Beta] Get a list of translation fields per description set.
     * @throws FetchError<404, types.GetFieldsPerDescriptionSetResponse404> Not Found
     */
    SDK.prototype.getFieldsPerDescriptionSet = function (metadata) {
        return this.core.fetch('/marketing/fields/{id}/description-sets/{descriptionSetId}', 'get', metadata);
    };
    /**
     * Upsert a new translation for specific listing and language slug.
     *
     * @summary Upsert translation
     * @throws FetchError<404, types.UpsertFieldsResponse404> Not Found
     */
    SDK.prototype.upsertFields = function (body, metadata) {
        return this.core.fetch('/marketing/fields/{id}/upsert', 'put', body, metadata);
    };
    /**
     * Retrieve a list of supported languages.
     *
     * @summary Retrieve a list of supported languages.
     * @throws FetchError<403, types.GetLanguagesResponse403> Unauthorized Request.
     */
    SDK.prototype.getLanguages = function () {
        return this.core.fetch('/marketing/languages', 'get');
    };
    /**
     * Retrieve a list of supported languages for specific listing by listing id
     *
     * @summary [Beta] Retrieve a list of supported languages for specific listing
     * @throws FetchError<403, types.GetPropertyLanguagesResponse403> Unauthorized Request.
     * @throws FetchError<404, types.GetPropertyLanguagesResponse404> Not Found
     */
    SDK.prototype.getPropertyLanguages = function (metadata) {
        return this.core.fetch('/marketing/languages/{id}', 'get', metadata);
    };
    /**
     * Upsert supported languages for specific listing
     *
     * @summary [Beta] upsert supported languages for specific listing
     * @throws FetchError<403, types.UpsertPropertyLanguagesResponse403> Unauthorized Request.
     * @throws FetchError<404, types.UpsertPropertyLanguagesResponse404> Not Found
     */
    SDK.prototype.upsertPropertyLanguages = function (body, metadata) {
        return this.core.fetch('/marketing/languages/{id}', 'put', body, metadata);
    };
    /**
     * Retrieve a list of supported channels.
     *
     * @summary Retrieve a list of supported channels.
     * @throws FetchError<403, types.GetChannelsResponse403> Unauthorized Request.
     */
    SDK.prototype.getChannels = function () {
        return this.core.fetch('/marketing/channels', 'get');
    };
    /**
     * Retrieve a list of description sets for a specific Listing.
     *
     * @summary [Beta] Get a list of description sets.
     * @throws FetchError<403, types.GetDescriptionSetsResponse403> Unauthorized Request.
     * @throws FetchError<404, types.GetDescriptionSetsResponse404> Not Found
     */
    SDK.prototype.getDescriptionSets = function (metadata) {
        return this.core.fetch('/marketing/description-sets/{listingId}', 'get', metadata);
    };
    /**
     * Create a new Description Set.
     *
     * @summary [Beta] Create Description Set.
     * @throws FetchError<403, types.CreateDescriptionSetResponse403> Unauthorized Request.
     * @throws FetchError<404, types.CreateDescriptionSetResponse404> Not Found
     */
    SDK.prototype.createDescriptionSet = function (body) {
        return this.core.fetch('/marketing/description-sets', 'post', body);
    };
    /**
     * Update the Description Set.
     *
     * @summary [Beta] Update Description Set.
     * @throws FetchError<403, types.UpdateDescriptionSetResponse403> Unauthorized Request.
     * @throws FetchError<404, types.UpdateDescriptionSetResponse404> Not Found
     */
    SDK.prototype.updateDescriptionSet = function (body, metadata) {
        return this.core.fetch('/marketing/description-sets/{id}', 'put', body, metadata);
    };
    /**
     * Delete the Description Set.
     *
     * @summary [Beta] Delete Description Set.
     * @throws FetchError<403, types.DeleteDescriptionSetResponse403> Unauthorized Request.
     * @throws FetchError<404, types.DeleteDescriptionSetResponse404> Not Found
     */
    SDK.prototype.deleteDescriptionSet = function (metadata) {
        return this.core.fetch('/marketing/description-sets/{id}', 'delete', metadata);
    };
    /**
     * Get the listing address of the given property.
     *
     * @summary Retrieve Property Address
     * @throws FetchError<403, types.AddressControllerGetAddressResponse403> Unauthorized Request.
     * @throws FetchError<404, types.AddressControllerGetAddressResponse404> Address not found.
     */
    SDK.prototype.addressController_getAddress = function (metadata) {
        return this.core.fetch('/address/{id}', 'get', metadata);
    };
    /**
     * Converts the full address into latitude and longitude coordinates and populates
     * individual address fields.
     *
     * @summary Geocode Location by Full Address
     * @throws FetchError<403, types.AddressControllerGeocodeAddressResponse403> Unauthorized Request.
     */
    SDK.prototype.addressController_geocodeAddress = function (body) {
        return this.core.fetch('/address/geocode', 'post', body);
    };
    /**
     * Edit the address of a given property. If it is a multi-unit, all sub-units will be
     * updated too.
     *
     * @summary Update Property Address
     * @throws FetchError<403, types.AddressControllerUpdateAddressResponse403> Unauthorized Request.
     * @throws FetchError<404, types.AddressControllerUpdateAddressResponse404> Address not found.
     */
    SDK.prototype.addressController_updateAddress = function (body, metadata) {
        return this.core.fetch('/address/{id}/update', 'put', body, metadata);
    };
    /**
     * Edit a complex's address. All children will be updated too.
     *
     * @summary Update Complex Address
     * @throws FetchError<403, types.AddressControllerUpdateComplexAddressResponse403> Unauthorized Request.
     * @throws FetchError<404, types.AddressControllerUpdateComplexAddressResponse404> Address not found.
     */
    SDK.prototype.addressController_updateComplexAddress = function (body, metadata) {
        return this.core.fetch('/address/{id}/update/complex', 'put', body, metadata);
    };
    /**
     * Use this call to send a [pre-approval](https://www.airbnb.com/help/article/35).
     *
     * @summary Pre-approve an existing inquiry (Airbnb)
     * @throws FetchError<400, types.PostReservationsApiReservationsReservationidPreApproveResponse400> Invalid request
     * @throws FetchError<500, types.PostReservationsApiReservationsReservationidPreApproveResponse500> Unhandled exception. Something went wrong on server.
     */
    SDK.prototype.postReservationsApiReservationsReservationidPreApprove = function (metadata) {
        return this.core.fetch('/reservations-api/reservations/{reservationId}/pre-approve', 'post', metadata);
    };
    /**
     * Create a reservation based on an existing quote with all the necessary reservation data.
     * You can create a quote using the [dedicated
     * endpoint](https://open-api-docs.guesty.com/reference/quotesopenapicontroller_create) or
     * the [booking engine
     * API](https://booking-api-docs.guesty.com/reference/createreservationquote).
     *
     * @summary Create a reservation from quote
     */
    SDK.prototype.reservationsOpenApiController_createReservation = function (body) {
        return this.core.fetch('/reservations-v3/quote', 'post', body);
    };
    /**
     * Create a confirmed owner reservation - This endpoint enables the creation of an Owner
     * Reservation instantly with minimal required input. It is designed for simplicity and
     * speed, focusing on essential details only. Behind the scenes, it will create a quote +
     * reservation from a quote picking the first applicable rate plan and promotions
     *
     * @summary Create a confirmed owner reservation
     */
    SDK.prototype.reservationsOpenApiController_createOwnerConfirmed = function (body) {
        return this.core.fetch('/reservations-v3/owner/confirmed', 'post', body);
    };
    /**
     * Create a reservation without needing a quote. When the listing doesn't have an active
     * rate plan assigned, a default rate plan is selected. Otherwise, the first active rate
     * plan is selected.
     *
     * @summary Create a Reservation Without a Quote
     */
    SDK.prototype.reservationsOpenApiController_quickBooking = function (body) {
        return this.core.fetch('/reservations-v3', 'post', body);
    };
    /**
     * Retrieve multiple reservations by ID. Use this endpoint to get all the relevant
     * information about your reservation including the financial breakdown and guest details
     *
     * @summary Retrieve Reservations
     */
    SDK.prototype.reservationsOpenApiController_getReservationsByIds = function (metadata) {
        return this.core.fetch('/reservations-v3', 'get', metadata);
    };
    /**
     * Change the guest stay status of the reservation
     *
     * @summary Change Reservation Guest Stay Status
     */
    SDK.prototype.reservationsOpenApiController_changeStay = function (body) {
        return this.core.fetch('/reservations-v3/guest-stay', 'put', body);
    };
    /**
     * Change a reservation's source and point of sale parameters and choose whether to
     * recalculate financials
     *
     * @summary Change Reservation Source
     */
    SDK.prototype.reservationsOpenApiController_updateReservationSource = function (body, metadata) {
        return this.core.fetch('/reservations-v3/{reservationId}/source', 'put', body, metadata);
    };
    /**
     * Update reservation notes, including the key code and special requests fields
     *
     * @summary Update Reservation notes
     */
    SDK.prototype.reservationsOpenApiController_updateReservationNotes = function (body, metadata) {
        return this.core.fetch('/reservations-v3/{reservationId}/notes', 'put', body, metadata);
    };
    /**
     * Change the check-in or check-out date and time for a specific reservation. Modifying the
     * date will automatically trigger a financial recalculation, regardless of the
     * `applyRecalculation` flag
     *
     * @summary Update Reservation Dates
     */
    SDK.prototype.reservationsOpenApiController_updateReservationDates = function (body, metadata) {
        return this.core.fetch('/reservations-v3/{reservationId}/dates', 'put', body, metadata);
    };
    /**
     * Change a listing for specific reservations.
     *
     * @summary Update reservation listing
     */
    SDK.prototype.reservationsOpenApiController_updateReservationListing = function (body, metadata) {
        return this.core.fetch('/reservations-v3/{reservationId}/relocate', 'put', body, metadata);
    };
    /**
     * Update the status of a reservation to one of the supported statuses
     *
     * @summary Update reservation status
     */
    SDK.prototype.reservationsOpenApiController_updateReservationStatus = function (body, metadata) {
        return this.core.fetch('/reservations-v3/{reservationId}/status', 'put', body, metadata);
    };
    /**
     * Update the confirmation code of a reservation
     *
     * @summary Update reservation confirmation code
     */
    SDK.prototype.reservationsOpenApiController_updateReservationConfirmationCode = function (body, metadata) {
        return this.core.fetch('/reservations-v3/{reservationId}/confirmation-code', 'put', body, metadata);
    };
    /**
     * Update the reservation guest count, including the guest breakdown object (adults,
     * children, infants, pets, etc.). Financial recalculation is automatically applied
     *
     * @summary Update Reservation Guests Breakdown
     */
    SDK.prototype.reservationsOpenApiController_updateReservationGuests = function (body, metadata) {
        return this.core.fetch('/reservations-v3/{reservationId}/guests', 'put', body, metadata);
    };
    /**
     * Edit the values of any custom fields on an existing reservation.
     *
     * @summary Update reservation's Custom Fields
     */
    SDK.prototype.reservationsOpenApiController_updateReservationCustomFields = function (body, metadata) {
        return this.core.fetch('/reservations-v3/{reservationId}/custom-fields', 'put', body, metadata);
    };
    /**
     * Get all custom fields for a reservation
     *
     * @summary Get all custom fields for a reservation
     */
    SDK.prototype.reservationsOpenApiController_getReservationAllCustomFields = function (metadata) {
        return this.core.fetch('/reservations-v3/{reservationId}/custom-fields', 'get', metadata);
    };
    /**
     * Get a specific custom field for a reservation by field ID
     *
     * @summary Get a specific custom field for a reservation
     */
    SDK.prototype.reservationsOpenApiController_getReservationCustomField = function (metadata) {
        return this.core.fetch('/reservations-v3/{reservationId}/custom-fields/{fieldId}', 'get', metadata);
    };
    /**
     * Delete an existing custom field from a reservation.
     *
     * @summary Delete reservation's Custom Field
     */
    SDK.prototype.reservationsOpenApiController_deleteReservationCustomField = function (metadata) {
        return this.core.fetch('/reservations-v3/{reservationId}/custom-fields/{fieldId}', 'delete', metadata);
    };
    /**
     * Relocate guests to a different listing during their stay
     *
     * @summary Create a mid-stay
     * @throws FetchError<400, types.ReservationsOpenApiControllerCreateMidStayResponse400> Bad Request - Various validation and availability errors
     */
    SDK.prototype.reservationsOpenApiController_createMidStay = function (body) {
        return this.core.fetch('/reservations-v3/mid-stay', 'post', body);
    };
    /**
     * Get group reservation by group id, including it's sub reservations (up to 25 sub
     * reservations)
     *
     * @summary Get group reservation by group id
     */
    SDK.prototype.groupReservationsOpenAPIController_getGroupReservation = function (metadata) {
        return this.core.fetch('/reservations-v3/group/{groupId}', 'get', metadata);
    };
    /**
     * This endpoint allows the creation of a group reservation, based on an array of quotes
     *
     * @summary Create a group reservation
     */
    SDK.prototype.groupReservationsOpenAPIController_create = function (body) {
        return this.core.fetch('/reservations-v3/group', 'post', body);
    };
    /**
     * This endpoint allows retrieval of a specific quote using its unique ID. It is used to
     * fetch details of a previously created quote. If the quote has expired, the endpoint
     * returns an error message indicating that the quote is expired and suggests creating a
     * new quote.
     *
     * @summary Retrieve a Quote by ID
     */
    SDK.prototype.quotesOpenApiController_getQuote = function (metadata) {
        return this.core.fetch('/quotes/{quoteId}', 'get', metadata);
    };
    /**
     * This endpoint allows the creation of a price quote for a reservation. It requires
     * details such as the listing ID, check-in and check-out dates, and guest count. The
     * response includes detailed information about the quote, including rates, promotions, and
     * applicable fees.
     *
     * @summary Create a Quote
     */
    SDK.prototype.quotesOpenApiController_create = function (body, metadata) {
        return this.core.fetch('/quotes', 'post', body, metadata);
    };
    /**
     * This endpoint allows the creation of multiple price quotes for a reservation.
     *
     * @summary Create multiple quotes for reservation
     */
    SDK.prototype.quotesOpenApiController_createMultiple = function (body, metadata) {
        return this.core.fetch('/quotes/multiple', 'post', body, metadata);
    };
    /**
     * Add coupons to an existing quote
     *
     * @summary Add coupons to an existing quote
     */
    SDK.prototype.quotesOpenApiController_changeCoupons = function (body, metadata) {
        return this.core.fetch('/quotes/{quoteId}/coupons', 'post', body, metadata);
    };
    /**
     * Retrieves a report of reservations based on the view ID
     *
     * @summary Get reservations report by view id
     */
    SDK.prototype.reservationsReportsOpenApiController_getReportByViewId = function (metadata) {
        return this.core.fetch('/reservations-reports/{viewId}', 'get', metadata);
    };
    /**
     * Retrieve reviews sorted descending by last update time
     *
     * @summary Retrieve reviews sorted descending by last update time
     */
    SDK.prototype.reviewController_getReviews = function (metadata) {
        return this.core.fetch('/reviews', 'get', metadata);
    };
    /**
     * Publish a review by channel
     *
     * @summary Publish a review by channel
     */
    SDK.prototype.reviewController_upsertReview = function (body) {
        return this.core.fetch('/reviews', 'put', body);
    };
    /**
     * Retrieve Average reviews score by Listings IDs
     *
     * @summary Retrieve Average reviews score by Listings IDs
     */
    SDK.prototype.reviewController_getListingsAverageReview = function (metadata) {
        return this.core.fetch('/reviews/listings-average', 'get', metadata);
    };
    /**
     * Retrieve a review
     *
     * @summary Retrieve a review
     */
    SDK.prototype.reviewController_getReview = function (metadata) {
        return this.core.fetch('/reviews/{reviewId}', 'get', metadata);
    };
    /**
     * Publish reply to channel and store in DB. Airbnb and Booking.com allow to publish only
     * one reply per review. Airbnb allows to update reply. Booking.com does not allow to
     * update reply
     *
     * @summary Publish review reply to channel
     */
    SDK.prototype.reviewController_upsertReviewReply = function (body, metadata) {
        return this.core.fetch('/reviews/{reviewId}/reply', 'put', body, metadata);
    };
    /**
     * Get promotion list by account id.
     *
     * @summary Get promotion list by account id.
     */
    SDK.prototype.promotionController_getList = function () {
        return this.core.fetch('/rm-promotions/promotions', 'get');
    };
    /**
     * Assign listings to promotion.
     *
     * @summary Assign listings to promotion.
     */
    SDK.prototype.promotionController_assignListings = function (body, metadata) {
        return this.core.fetch('/rm-promotions/promotions/{promotionId}/assign', 'put', body, metadata);
    };
    /**
     * Unassign listings from promotion.
     *
     * @summary Unassign listings from promotion.
     */
    SDK.prototype.promotionController_unassignListings = function (body, metadata) {
        return this.core.fetch('/rm-promotions/promotions/{promotionId}/unassign', 'put', body, metadata);
    };
    /**
     * Retrieves all rate plans by channel.
     *
     *  Currently in pilot, the Rate Plans API allows the creation and management of
     * independent rate plans that are not visible or editable within the Guesty UI. This API
     * is available exclusively for <a href="http://Booking.com">Booking.com</a>   and direct
     * reservations.
     *
     * To participate in the pilot, customers should contact Guesty for an eligibility review
     * and to receive detailed information on potential limitations and risks.
     *
     * @summary Get All Rate Plans
     */
    SDK.prototype.ratePlanController_getAll = function (metadata) {
        return this.core.fetch('/rm-rate-plans-ext/rate-plans', 'get', metadata);
    };
    /**
     * Creates a Rate Plan.
     *
     *  Currently in pilot, the Rate Plans API allows the creation and management of
     * independent rate plans that are not visible or editable within the Guesty UI. This API
     * is available exclusively for <a href="http://Booking.com">Booking.com</a>   and direct
     * reservations.
     *
     * To participate in the pilot, customers should contact Guesty for an eligibility review
     * and to receive detailed information on potential limitations and risks.
     *
     * @summary Create a Rate Plan
     * @throws FetchError<400, types.RatePlanControllerCreateResponse400> Bad request
     */
    SDK.prototype.ratePlanController_create = function (body) {
        return this.core.fetch('/rm-rate-plans-ext/rate-plans', 'post', body);
    };
    /**
     * Retrieves a rate plan by querying its ID.
     *
     *  Currently in pilot, the Rate Plans API allows the creation and management of
     * independent rate plans that are not visible or editable within the Guesty UI. This API
     * is available exclusively for <a href="http://Booking.com">Booking.com</a>   and direct
     * reservations.
     *
     * To participate in the pilot, customers should contact Guesty for an eligibility review
     * and to receive detailed information on potential limitations and risks.
     *
     * @summary Get a Rate Plan by ID
     * @throws FetchError<404, types.RatePlanControllerGetByIdResponse404> Not found
     */
    SDK.prototype.ratePlanController_getById = function (metadata) {
        return this.core.fetch('/rm-rate-plans-ext/rate-plans/{ratePlanId}', 'get', metadata);
    };
    /**
     * Updates an existing rate plan.
     *
     *  Currently in pilot, the Rate Plans API allows the creation and management of
     * independent rate plans that are not visible or editable within the Guesty UI. This API
     * is available exclusively for <a href="http://Booking.com">Booking.com</a>   and direct
     * reservations.
     *
     * To participate in the pilot, customers should contact Guesty for an eligibility review
     * and to receive detailed information on potential limitations and risks.
     *
     * @summary Update a Rate Plan
     * @throws FetchError<400, types.RatePlanControllerUpdateResponse400> Bad request
     * @throws FetchError<404, types.RatePlanControllerUpdateResponse404> Not found
     */
    SDK.prototype.ratePlanController_update = function (body, metadata) {
        return this.core.fetch('/rm-rate-plans-ext/rate-plans/{ratePlanId}', 'put', body, metadata);
    };
    /**
     * patch rate plan.
     *
     *  Currently in pilot, the Rate Plans API allows the creation and management of
     * independent rate plans that are not visible or editable within the Guesty UI. This API
     * is available exclusively for <a href="http://Booking.com">Booking.com</a>   and direct
     * reservations.
     *
     * To participate in the pilot, customers should contact Guesty for an eligibility review
     * and to receive detailed information on potential limitations and risks.
     *
     * @summary patch rate plan
     * @throws FetchError<400, types.RatePlanControllerPatchResponse400> Bad request
     * @throws FetchError<404, types.RatePlanControllerPatchResponse404> Not found
     */
    SDK.prototype.ratePlanController_patch = function (body, metadata) {
        return this.core.fetch('/rm-rate-plans-ext/rate-plans/{ratePlanId}', 'patch', body, metadata);
    };
    /**
     * Deletes an existing rate plan.
     *
     *  Currently in pilot, the Rate Plans API allows the creation and management of
     * independent rate plans that are not visible or editable within the Guesty UI. This API
     * is available exclusively for <a href="http://Booking.com">Booking.com</a>   and direct
     * reservations.
     *
     * To participate in the pilot, customers should contact Guesty for an eligibility review
     * and to receive detailed information on potential limitations and risks.
     *
     * @summary Remove a Rate Plan
     * @throws FetchError<404, types.RatePlanControllerRemoveResponse404> Not found
     */
    SDK.prototype.ratePlanController_remove = function (metadata) {
        return this.core.fetch('/rm-rate-plans-ext/rate-plans/{ratePlanId}', 'delete', metadata);
    };
    /**
     * Assigns listings to a rate plan.
     *
     *  Currently in pilot, the Rate Plans API allows the creation and management of
     * independent rate plans that are not visible or editable within the Guesty UI. This API
     * is available exclusively for <a href="http://Booking.com">Booking.com</a>   and direct
     * reservations.
     *
     * To participate in the pilot, customers should contact Guesty for an eligibility review
     * and to receive detailed information on potential limitations and risks.
     *
     * @summary Assign Properties to a Rate Plan
     * @throws FetchError<400, types.RatePlanControllerInitAssignListingsResponse400> Bad request
     * @throws FetchError<404, types.RatePlanControllerInitAssignListingsResponse404> Not found
     */
    SDK.prototype.ratePlanController_initAssignListings = function (body, metadata) {
        return this.core.fetch('/rm-rate-plans-ext/rate-plans/{ratePlanId}/init-assign-listings', 'put', body, metadata);
    };
    /**
     * Removes listings from a rate plan.
     *
     *  Currently in pilot, the Rate Plans API allows the creation and management of
     * independent rate plans that are not visible or editable within the Guesty UI. This API
     * is available exclusively for <a href="http://Booking.com">Booking.com</a>   and direct
     * reservations.
     *
     * To participate in the pilot, customers should contact Guesty for an eligibility review
     * and to receive detailed information on potential limitations and risks.
     *
     * @summary Unassign Properties from a Rate Plan
     * @throws FetchError<400, types.RatePlanControllerInitUnassignListingsResponse400> Bad request
     * @throws FetchError<404, types.RatePlanControllerInitUnassignListingsResponse404> Not found
     */
    SDK.prototype.ratePlanController_initUnassignListings = function (body, metadata) {
        return this.core.fetch('/rm-rate-plans-ext/rate-plans/{ratePlanId}/init-unassign-listings', 'put', body, metadata);
    };
    /**
     * Retrieve rate plans by the listing ID.
     *
     *  Currently in pilot, the Rate Plans API allows the creation and management of
     * independent rate plans that are not visible or editable within the Guesty UI. This API
     * is available exclusively for <a href="http://Booking.com">Booking.com</a>   and direct
     * reservations.
     *
     * To participate in the pilot, customers should contact Guesty for an eligibility review
     * and to receive detailed information on potential limitations and risks.
     *
     * @summary Get Rate Plans by Property
     * @throws FetchError<404, types.RatePlanControllerGetByListingResponse404> Not found
     */
    SDK.prototype.ratePlanController_getByListing = function (metadata) {
        return this.core.fetch('/rm-rate-plans-ext/rate-plans/listing/{listingId}', 'get', metadata);
    };
    /**
     * Retrieves the rate plan's rates, availability and inventory by calendar date.
     *
     * @summary GET Rate Plan Calendar
     */
    SDK.prototype.ariCalendarController_get = function (metadata) {
        return this.core.fetch('/rm-rate-plans-ext/ari-calendar/listing/{listingId}/ratePlan/{ratePlanId}', 'get', metadata);
    };
    /**
     * Set rate plan calendar availability, rates and inventory.
     *
     * @summary Upsert Rate Plan ARI Calendar
     * @throws FetchError<400, types.AriCalendarControllerUpsertResponse400> Bad request
     */
    SDK.prototype.ariCalendarController_upsert = function (body, metadata) {
        return this.core.fetch('/rm-rate-plans-ext/ari-calendar/listing/{listingId}/ratePlan/{ratePlanId}', 'put', body, metadata);
    };
    /**
     * Use this endpoint to retrieve an account's associated rate strategy settings.
     *
     * @summary Retrieve All Rate Strategies.
     */
    SDK.prototype.rateStrategyController_getList = function () {
        return this.core.fetch('/rm-rate-strategies-open-api/rate-strategies', 'get');
    };
    /**
     * Use this endpoint to retrieve the property's associated rate strategy settings.
     *
     * @summary Retrieve Property's Rate Strategy.
     */
    SDK.prototype.rateStrategyController_getByUnitTypeId = function (metadata) {
        return this.core.fetch('/rm-rate-strategies-open-api/rate-strategies/unitType/{unitTypeId}', 'get', metadata);
    };
    /**
     * Get a specific Smart Calendar Rule
     *
     * @summary Get smart calendar rule
     */
    SDK.prototype.scrOpenApiController_getScrByPublicId = function (metadata) {
        return this.core.fetch('/api/scr-v2/open-api/{scrId}', 'get', metadata);
    };
    /**
     * Remove a specific Smart Calendar Rule from Guesty.
     *
     * @summary Remove a Smart Calendar Rule
     */
    SDK.prototype.scrOpenApiController_removeSmartCalendarRule = function (metadata) {
        return this.core.fetch('/api/scr-v2/open-api/{scrId}', 'delete', metadata);
    };
    /**
     * Update a specific Smart Calendar Rule in Guesty
     *
     * @summary Update a Smart Calendar Rule
     */
    SDK.prototype.scrOpenApiController_updateScr = function (body, metadata) {
        return this.core.fetch('/api/scr-v2/open-api/{scrId}', 'put', body, metadata);
    };
    /**
     * Get a list of Smart Calendar Rules based on specific property
     *
     * @summary Get Smart Calendar Rules per listing
     */
    SDK.prototype.scrOpenApiController_getScrList = function (metadata) {
        return this.core.fetch('/api/scr-v2/open-api/{listingId}/list', 'get', metadata);
    };
    /**
     * Create a new smart calendar rule in Guesty to sync between two or more property
     * calendars
     *
     * @summary Create a smart calendar rule
     */
    SDK.prototype.scrOpenApiController_createScr = function (body) {
        return this.core.fetch('/api/scr-v2/open-api', 'post', body);
    };
    /**
     * Get guest code data for reservations with future check-out times, by reservation ID.
     *       Note: The main guest codes are codes with "purpose" set to "GUEST".
     *       Codes with "purpose" set to "GUEST_BACKUP" are codes to share with guests in case
     * the "GUEST" code has errors, starting from the check-in day.
     *       "GUEST_BACKUP" codes are a dynamic pool of codes associated with reservations on
     * check-in day. When fetching a "GUEST_BACKUP" code before the check-in day, the code is
     * not guaranteed to stay the same until the check-in day.
     *
     * @summary Get guest code
     * @throws FetchError<400, types.ReservationAccessCodeControllerGetLocksAndCodesByReservationResponse400> Bad request
     * @throws FetchError<404, types.ReservationAccessCodeControllerGetLocksAndCodesByReservationResponse404> Can't find reservation, by provided ID
     */
    SDK.prototype.reservationAccessCodeController_getLocksAndCodesByReservation = function (metadata) {
        return this.core.fetch('/guest-code', 'get', metadata);
    };
    /**
     * Get a list of vendors
     *
     * @summary Query vendors
     * @throws FetchError<400, types.VendorsControllerGetAllResponse400> Validation failed
     * @throws FetchError<403, types.VendorsControllerGetAllResponse403> You do not have sufficient permissions to access this resource
     * @throws FetchError<500, types.VendorsControllerGetAllResponse500> Unhandled exception. Something went wrong on server
     */
    SDK.prototype.vendorsController_getAll = function (metadata) {
        return this.core.fetch('/vendors', 'get', metadata);
    };
    /**
     * Get specific vendor by ID
     *
     * @summary Query a vendor
     * @throws FetchError<403, types.VendorsControllerGetByIdResponse403> You do not have sufficient permissions to access this resource
     * @throws FetchError<404, types.VendorsControllerGetByIdResponse404> Can't find vendor, by provided ID
     * @throws FetchError<500, types.VendorsControllerGetByIdResponse500> Unhandled exception. Something went wrong on server
     */
    SDK.prototype.vendorsController_getById = function (metadata) {
        return this.core.fetch('/vendors/{id}', 'get', metadata);
    };
    return SDK;
}());
var createSDK = (function () { return new SDK(); })();
module.exports = createSDK;
