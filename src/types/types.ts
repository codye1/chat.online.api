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

type UserPreview = {
  id: string;
  nickname: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  lastSeenAt: Date;
};

type Roles = "OWNER" | "PARTICIPANT";
type UserPreviewAtConversation = UserPreview & {
  conversationId: string;
  role: Roles;
};

type ConversationTypes = "DIRECT" | "GROUP";

interface ConversationParticipant {
  id: string;
  userId: string;
  conversationId: string;
  pinnedPosition: number | null;
  archivedPinnedPosition: number | null;
  isArchived: boolean;
  isMuted: boolean;
  lastReadMessageId: string | null;
  role: Roles;
}

interface BaseConversationData {
  id: string;
  avatarUrl: string | null;
  title: string;
  type: ConversationTypes;
  unreadMessages: number;
  isArchived: boolean;
  isMuted: boolean;
  createdAt: Date;
  lastMessage: { text: string; createdAt: string; id: string } | null;
  activeUsers: { nickname: string; reason: "typing" | "editing" }[];
}

type EditableConversationSettings = Partial<
  Pick<BaseConversationData, "isArchived" | "isMuted">
>;

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
  participantsCount: number;
  participants: UserPreviewAtConversation[];
  hasMoreParticipants: boolean;
  ownerId: string;
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
  ownerId: string;
}

type ConversationPreview = DirectPreview | GroupPreview;

interface FolderDto {
  id: string;
  title: string;
  position: number;
  icon?: string;
  pinnedConversationIds: string[];
  unpinnedConversationIds: string[];
}

interface ConversationsInit {
  byId: Record<string, ConversationPreview>;
  activeIds: {
    pinned: string[];
    unpinned: string[];
  };
  archivedIds: {
    pinned: string[];
    unpinned: string[];
  };
  folders: FolderDto[];
}

interface ConversationWithParticipants {
  id: string;
  type: "DIRECT" | "GROUP";
  title: string | null;
  avatarUrl: string | null;
  messages?: { id: string; text: string; createdAt: Date }[];
  createdAt: Date;
  _count: {
    participants: number;
  };
  participants: {
    userId: string;
    lastReadMessageId: string | null;
    user: User;
    isMuted: boolean;
    isArchived: boolean;
    role: Roles;
  }[];
}

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

interface MessageMedia {
  id: string;
  src: string;
  type: string; // "image", "video"
  filename: string;
}

interface Message {
  id: string;
  text: string;
  conversationId: string;
  sender: UserPreviewAtConversation;
  status: "SENDING" | "SENT" | "FAILED" | "DELIVERED" | "READ";
  createdAt: string;
  reactions: GroupedReactions;
  replyTo?: ReplyMessage | null;
  media?: MessageMedia[];
}

export type {
  User,
  Roles,
  Conversation,
  ConversationPreview,
  ConversationsInit,
  ConversationWithParticipants,
  ConversationTypes,
  FolderDto,
  Message,
  MessageMedia,
  GroupedReactions,
  UserPreview,
  UserPreviewAtConversation,
  Reaction,
  ReactorListItem,
  EditableConversationSettings,
  ConversationParticipant,
};
