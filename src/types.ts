/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Reply {
  id: string;
  author: string;
  text: string;
  createdAt: string;
}

export interface Comment {
  id: string;
  selectedText?: string;
  author: string;
  text: string;
  createdAt: string;
  replies?: Reply[];
}

export interface Version {
  id: string;
  writingId: string;
  title: string;
  content: string;
  savedAt: string;
  label: string; // e.g. "Sauvegarde automatique" or "V1 - Premier Jet"
  type: "auto" | "manual";
}

export interface StoryChapter {
  id: string;
  title: string;
  summary: string;
  wordGoal?: number;
  completed?: boolean;
}

export interface StoryCharacter {
  id: string;
  name: string;
  role: string;
  description: string;
}

export interface StoryPlotPoint {
  id: string;
  title: string;
  description: string;
}

export interface Writing {
  id: string;
  title: string;
  content: string;
  themes: string[];
  emotions: string[];
  createdAt: string;
  updatedAt: string;
  deadlineDate: string | null;
  deadlineWordCount: number | null;
  comments: Comment[];
  userEmail?: string;
  type?: "poeme" | "roman" | "nouvelle" | "autre";
  chapters?: StoryChapter[];
  characters?: StoryCharacter[];
  plotPoints?: StoryPlotPoint[];
}

export interface WritingGoal {
  id: string;
  writingId: string;
  title: string;
  targetWords: number;
  dueDate: string;
  completed: boolean;
}

export interface WritingStats {
  wordCount: number;
  charCount: number;
  linesCount: number;
  readabilityScore: number; // 0-100 score
  lexicalRichness: number; // 0-100 percentage of unique words
  emotionScores: {
    melancolie: number;
    joie: number;
    nostalgie: number;
    serenite: number;
    mystere: number;
    revolte: number;
  };
  suggestions: string[];
}

export interface ProductivityDay {
  date: string; // YYYY-MM-DD
  wordsWritten: number;
  minutesSpent: number;
  userEmail?: string;
}

export interface PublishedWork {
  title: string;
  url: string;
}

export interface SocialConnections {
  twitter?: string;
  github?: string;
  linkedin?: string;
  instagram?: string;
  website?: string;
}

export interface UserProfile {
  email: string;
  displayName: string;
  penName: string;
  bio: string;
  avatarUrl: string;
  publishedWorks: PublishedWork[];
  socials: SocialConnections;
  isCurrentUser?: boolean;
  isRestricted?: boolean;
  geminiApiKey?: string;
}

export interface PrivateMessage {
  id: string;
  senderEmail: string;
  receiverEmail: string;
  content: string;
  createdAt: string;
}

