interface User {
  id: string;
  email: string;
  nickname: string;
  avatarUrl: string | null;
  lastName: string | null;
  firstName: string | null;
  biography: string | null;
  lastSeenAt: Date;
}
type ConversationTypes = "DIRECT" | "GROUP";

interface BaseConversationData {
  id: string;
  avatarUrl: string | null;
  title: string;
  type: ConversationTypes;
  unreadMessages: number;
  lastMessage: { text: string; createdAt: string; id: string } | null;
  activeUsers: { nickname: string; reason: "typing" | "editing" }[];
}

interface BaseConversation extends BaseConversationData {
  lastReadId: string | null;
  lastReadIdByParticipants: string | null;
}

interface DirectConversation extends BaseConversation {
  type: "DIRECT";
  lastSeenAt: Date | null;
  otherParticipant: User;
}

interface GroupConversation extends BaseConversation {
  type: "GROUP";
}

type Conversation = DirectConversation | GroupConversation;

interface DirectPreview extends BaseConversationData {
  type: "DIRECT";
  otherParticipant: {
    id: string;
  };
}

interface GroupPreview extends BaseConversationData {
  type: "GROUP";
}

type ConversationPreview = DirectPreview | GroupPreview;

interface ConversationWithParticipants {
  id: string;
  type: "DIRECT" | "GROUP";
  title: string | null;
  avatarUrl: string | null;
  messages?: { id: string; text: string; createdAt: Date }[];
  participants: {
    userId: string;
    lastReadMessageId: string | null;
    user: User;
  }[];
}

type UserPreview = {
  id: string;
  nickname: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
};

type Reaction = {
  id: string;
  content: string;
  createdAt: Date;
  messageId: string;
  userId: string;
};

type ReactorListItem = UserPreview & { reaction: Reaction };

type GroupedReactions = Record<
  string,
  { count: number; users: UserPreview[]; isActive: boolean }
>;

interface ReplyMessage {
  id: string;
  text: string;
  sender: UserPreview;
}

interface Message {
  id: string;
  text: string;
  conversationId: string;
  sender: UserPreview;
  createdAt: string;
  reactions: GroupedReactions;
  replyTo?: ReplyMessage | null;
}

export type {
  User,
  Conversation,
  ConversationPreview,
  ConversationWithParticipants,
  ConversationTypes,
  Message,
  GroupedReactions,
  UserPreview,
  Reaction,
  ReactorListItem,
};
