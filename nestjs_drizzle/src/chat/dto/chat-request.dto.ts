/**
 * 채팅 전송 요청 (SR §3). 사용자(userPk)는 JWT 에서 얻으므로 body 에 포함하지 않는다.
 */
export interface ChatRequest {
  chatRoomPk: string;
  chatData: string;
}
