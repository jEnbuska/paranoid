export type MessageData = {
  id: string;
  createdAt: number;
  createdBy: string;
  data: string;
};

export type MessageCallbacksData = {
  sendTextMessage(text: string): Promise<void>;
};

export type MessageStateData = {
  messages: Array<MessageData>;
};
