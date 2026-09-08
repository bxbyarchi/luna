import "@workspace/api-client-react";

declare module "@workspace/api-client-react" {
  interface CreateReceiptBody {
    locationId?: number | null;
  }
}
