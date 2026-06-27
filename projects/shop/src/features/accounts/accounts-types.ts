export interface Account {
  uuid: string;
  shopUid: number;
  name: string;
  address: string;
  telephone: string;
  commentCount: number;
  tags: string[];
}

export interface CreateAccountRequest {
  accountNumber: number;
  name: string;
  address: string;
  telephone: string;
}

export type CreateAccountResult =
  | { success: true; account: Account }
  | {
      success: false;
      error: "duplicate" | "max_reached" | "network" | "server" | "timeout";
    };
