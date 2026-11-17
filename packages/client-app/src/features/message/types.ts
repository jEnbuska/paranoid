export type Message = {
  id: string;
  createdAt: number;
  createdBy: "self" | "other";
  data: string;
};
