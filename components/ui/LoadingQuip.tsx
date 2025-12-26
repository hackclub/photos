"use client";
import { useEffect, useState } from "react";

const UPLOAD_QUIPS = [
  "Orpheus is roaring at the upload queue to make it go faster.",
  "Heidi found an SD card and is chewing on it. Upload speed may vary.",
  "Heidi unplugged the router on accident. She's apologizing with snacks.",
  "Orpheus is buffering… emotionally.",
  "Heidi just discovered what 'metadata' means and is screaming with excitement.",
  "Orpheus paused to admire your camera roll, estimated delay: infinite.",
  "Orpheus is warming up the server by sitting on it. Please wait.",
  'Heidi put your photos in a "safe place." The problem is remembering where that is.',
  "Heidi is untangling the fiber cables.",
  "Orpheus is compressing everything with hugs.",
  "Heidi found a bug, named it, and kept it as a pet.",
  "Orpheus is being emotionally supportive to your slow internet.",
  'Orpheus put on a lab coat and now insists he is "Dr. Upload."',
  "Heidi tried to upload a literal photo of herself. We're sorting this out.",
  "Orpheus started a motivational speech for the server. This could take a while.",
  "Heidi thinks 'cloud storage' means actual clouds. Explaining now.",
];
const MAP_QUIPS = [
  "Heidi is drawing the map with crayons. This might take a sec.",
  "Orpheus is arguing with GPS satellites about whose coordinates are better.",
  'Heidi keeps zooming in and out going "woooaaahhh" at the map.',
  "Orpheus is triple-checking permissions like a very responsible dino.",
  "Heidi found the map legend and is trying to eat it.",
  "Orpheus discovered map clusters and now wants to organize EVERYTHING.",
  "Heidi tried to fold the digital map like a paper one. It did not go well.",
  "Orpheus is giving each GPS coordinate a little motivational pep talk.",
  "Heidi sneezed and accidentally zoomed to Antarctica. Getting back now.",
  "Orpheus insists on alphabetizing all coordinates before displaying them.",
  "Heidi is playing connect-the-dots with the map markers. Art takes time.",
  "Orpheus started a petition to make all maps bigger.",
  "Heidi thought 'loading map' meant literally carrying a physical map. Pivoting.",
  "Orpheus is emotionally invested in which photo should be on top of each stack.",
];
const DOWNLOAD_QUIPS = [
  "Heidi is carefully wrapping each file in digital bubble wrap.",
  "Orpheus is creating a playlist for your download. Estimated time: vibes-dependent.",
  "Heidi is stuffing all your photos into a tiny ZIP bag. Physics be damned.",
  "Orpheus insists on quality-checking every pixel before download.",
  "Heidi found the download button and pressed it 47 times. We're working on it.",
  "Orpheus is compressing your files with the power of friendship.",
  "Heidi is organizing files by color. This wasn't in the spec but here we are.",
  "Orpheus is narrating each file's journey from server to your device.",
  "Heidi accidentally downloaded the entire internet. Narrowing it down now.",
  "Orpheus is gently encouraging each byte to make the journey.",
  "Heidi tried to physically grab the files from the screen. IT didn't work.",
  "Orpheus wrote a poem about your photos. He's reciting it. All of it.",
  "Heidi thinks ZIP files need actual zippers. We're explaining compression.",
  "Orpheus is individually thanking each file for participating. This may take a moment.",
  "Heidi started stress-eating cables during the download. Don't worry, they're licorice.",
  "Orpheus is doing breathing exercises with the server to keep it calm.",
];
const DELETE_QUIPS = [
  "Heidi is carefully shredding all the files! Stay patient.",
  "The Shredder has clogged up, give it a sec :)",
  "Paper jam, nooooo!",
  "Orpheus needs time to say goodbye to each file, every file should get a propper farewell.",
  "Heidi wants to make sure each file is propperly wiped from exitence.",
  "Letting go is hard okay.. Give us time :C",
  "Look, a file! Just kidding, it's gone.",
  "Hmmmm Deleting files.... Yes!",
  "Let me watch one more tiktkok, i promise ill stop procrastonating and delete your files right after!",
  "Did you know, that deleting files doesnt actually delete them, but just removed the reference to them? Crazy right!",
];
interface LoadingQuipProps {
  type?: "upload" | "map" | "download" | "delete";
  className?: string;
}
export default function LoadingQuip({
  type = "upload",
  className = "",
}: LoadingQuipProps) {
  const [quipIndex, setQuipIndex] = useState(0);
  const [displayedText, setDisplayedText] = useState("");
  const [isTyping, setIsTyping] = useState(true);
  const quips =
    type === "map"
      ? MAP_QUIPS
      : type === "download"
        ? DOWNLOAD_QUIPS
        : type === "delete"
          ? DELETE_QUIPS
          : UPLOAD_QUIPS;
  useEffect(() => {
    setQuipIndex(Math.floor(Math.random() * quips.length));
  }, [quips]);
  useEffect(() => {
    const currentQuip = quips[quipIndex];
    let timeout: ReturnType<typeof setTimeout>;
    if (isTyping) {
      if (displayedText.length < currentQuip.length) {
        timeout = setTimeout(
          () => {
            setDisplayedText(currentQuip.slice(0, displayedText.length + 1));
          },
          30 + Math.random() * 20,
        );
      } else {
        timeout = setTimeout(() => {
          setIsTyping(false);
        }, 3000);
      }
    } else {
      if (displayedText.length > 0) {
        timeout = setTimeout(() => {
          setDisplayedText(displayedText.slice(0, -1));
        }, 10);
      } else {
        setQuipIndex((prev) => (prev + 1) % quips.length);
        setIsTyping(true);
      }
    }
    return () => clearTimeout(timeout);
  }, [displayedText, isTyping, quipIndex, quips]);
  return (
    <div
      className={`font-mono text-sm md:text-base text-zinc-400 min-h-[1.5em] flex items-center justify-center ${className}`}
    >
      <span>
        {displayedText}
        <span className="animate-pulse ml-0.5 inline-block w-2 h-4 bg-zinc-500 align-middle" />
      </span>
    </div>
  );
}
