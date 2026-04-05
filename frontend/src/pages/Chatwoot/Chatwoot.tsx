import { ChatwootSidebar } from "./components/ChatwootSidebar";
import { ChatwootConversationPanel } from "./components/ChatwootConversationPanel";
import { ChatwootInfoPanel } from "./components/ChatwootInfoPanel";
import { ChatwootContactDetailsModal } from "./components/ChatwootContactDetailsModal";
import { useChatwootPageController } from "../../hooks/controller/chatwoot/useChatwootPageController";
import Style from "./Styles/Chatwoot.module.css";

export function ChatwootPage() {
  const {
    sidebar,
    conversationView,
    infoPanel,
    detailsModal,
    isConversationIa,
  } = useChatwootPageController();

  return (
    <div className={Style.root}>
      <ChatwootSidebar {...sidebar} isConversationIa={isConversationIa} />
      <ChatwootConversationPanel {...conversationView} />
      <ChatwootInfoPanel {...infoPanel} />
      <ChatwootContactDetailsModal {...detailsModal} />
    </div>
  );
}
