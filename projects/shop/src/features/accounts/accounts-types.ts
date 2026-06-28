export interface Account {
  uuid: string;
  shopUid: number;
  name: string;
  street?: string;
  place?: string;
  postcode?: string;
  canton?: string;
  email?: string;
  telephone?: string;
  commentCount: number;
  tags: string[];
}

export interface CreateAccountRequest {
  accountNumber: number;
  name: string;
  street?: string;
  place?: string;
  postcode?: string;
  canton?: string;
  email?: string;
  telephone?: string;
}

export type CreateAccountResult =
  | { success: true; account: Account }
  | {
      success: false;
      error: "duplicate" | "max_reached" | "network" | "server" | "timeout";
    };

export interface UpdateAccountRequest {
  name: string;
  street?: string;
  place?: string;
  postcode?: string;
  canton?: string;
  email?: string;
  telephone?: string;
}

export type UpdateAccountResult =
  | { success: true; account: Account }
  | {
      success: false;
      error: "not_found" | "network" | "server" | "timeout";
    };
