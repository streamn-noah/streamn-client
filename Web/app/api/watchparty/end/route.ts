import { RoomServiceClient } from "livekit-server-sdk";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { roomName } = await req.json();

    if (!roomName) {
      return NextResponse.json(
        { error: "roomName is required" },
        { status: 400 }
      );
    }

    const livekitHost = process.env.NEXT_PUBLIC_LIVEKIT_URL;
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;

    if (!livekitHost || !apiKey || !apiSecret) {
      return NextResponse.json(
        { error: "LiveKit credentials not configured" },
        { status: 500 }
      );
    }

    // Initialize the RoomServiceClient
    const roomService = new RoomServiceClient(livekitHost, apiKey, apiSecret);
    
    // Delete the room. This will disconnect all participants.
    await roomService.deleteRoom(roomName);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error ending room:", error);
    return NextResponse.json(
      { error: "Failed to end room" },
      { status: 500 }
    );
  }
}
