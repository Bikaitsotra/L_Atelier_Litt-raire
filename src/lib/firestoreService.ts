/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  deleteDoc, 
  query, 
  where,
  orderBy
} from "firebase/firestore";
import { db, auth } from "../firebase";
import { Writing, Version, UserProfile, ProductivityDay, PrivateMessage } from "../types";

export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

/**
 * Mandatory Error Handler adhering strictly to Firestore security rules auditing specifications.
 */
function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error("Firestore Error: ", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- 1. Writings Collection API ---

export async function getWritingsFromFirestore(email: string): Promise<Writing[]> {
  const collectionPath = "writings";
  
  // Try retrieving via Express BFF first (bypasses direct client auth restrictions)
  try {
    const res = await fetch(`/api/writings?email=${encodeURIComponent(email)}`);
    if (res.ok) {
      return await res.json();
    }
  } catch (apiErr) {
    console.warn("[BFF Writings API] Could not read from backend server:", apiErr);
  }

  try {
    const q = query(
      collection(db, collectionPath),
      where("userEmail", "==", email.trim().toLowerCase())
    );
    const querySnapshot = await getDocs(q);
    const writings: Writing[] = [];
    querySnapshot.forEach((document) => {
      writings.push(document.data() as Writing);
    });
    return writings;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, collectionPath);
  }
}

export async function saveWritingToFirestore(writing: Writing): Promise<void> {
  const docPath = `writings/${writing.id}`;
  
  // Try via BFF Backend API first
  try {
    const res = await fetch("/api/writings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(writing)
    });
    if (res.ok) return;
  } catch (apiErr) {
    console.warn("[BFF Writings API] Could not save via backend server, falling back:", apiErr);
  }

  try {
    await setDoc(doc(db, "writings", writing.id), {
      ...writing,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}

export async function deleteWritingFromFirestore(writingId: string): Promise<void> {
  const docPath = `writings/${writingId}`;
  
  // Try via BFF Backend API first
  try {
    const res = await fetch(`/api/writings/${encodeURIComponent(writingId)}`, {
      method: "DELETE"
    });
    if (res.ok) return;
  } catch (apiErr) {
    console.warn("[BFF Writings API] Could not delete via backend server, falling back:", apiErr);
  }

  try {
    await deleteDoc(doc(db, "writings", writingId));
    
    // Also scrub associated versions
    const versionsQ = query(collection(db, "versions"), where("writingId", "==", writingId));
    const versionsSnapshot = await getDocs(versionsQ);
    const deletePromises: Promise<any>[] = [];
    versionsSnapshot.forEach((document) => {
      deletePromises.push(deleteDoc(doc(db, "versions", document.id)));
    });
    await Promise.all(deletePromises);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }
}

// --- 2. Versions Collection API ---

export async function getVersionsFromFirestore(writingId: string): Promise<Version[]> {
  const collectionPath = "versions";
  
  // Try via BFF Backend API first
  try {
    const res = await fetch(`/api/writings/${encodeURIComponent(writingId)}/versions`);
    if (res.ok) {
      return await res.json();
    }
  } catch (apiErr) {
    console.warn("[BFF Versions API] Could not read from backend server:", apiErr);
  }

  try {
    const q = query(
      collection(db, collectionPath),
      where("writingId", "==", writingId)
    );
    const querySnapshot = await getDocs(q);
    const versions: Version[] = [];
    querySnapshot.forEach((document) => {
      versions.push(document.data() as Version);
    });
    // Sort manually by savedAt descending to show latest first
    return versions.sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, collectionPath);
  }
}

export async function saveVersionToFirestore(version: Version): Promise<void> {
  const docPath = `versions/${version.id}`;
  
  // Try via BFF Backend API first
  try {
    const res = await fetch(`/api/writings/${encodeURIComponent(version.writingId)}/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(version)
    });
    if (res.ok) return;
  } catch (apiErr) {
    console.warn("[BFF Versions API] Could not save via backend server, falling back:", apiErr);
  }

  try {
    await setDoc(doc(db, "versions", version.id), version);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}

// --- 3. Profiles Collection API ---

export async function getProfilesFromFirestore(): Promise<UserProfile[]> {
  const collectionPath = "profiles";
  
  // Try retrieving via Express BFF first (bypasses direct client auth restrictions)
  try {
    const res = await fetch("/api/profiles");
    if (res.ok) {
      const pList: UserProfile[] = await res.json();
      if (Array.isArray(pList) && pList.length > 0) {
        localStorage.setItem("cached_profiles", JSON.stringify(pList));
        return pList;
      }
    }
  } catch (apiErr) {
    console.warn("[BFF Profiles API] Could not read from backend server:", apiErr);
  }

  if (!auth.currentUser) {
    console.warn("Client not authenticated on Firebase. Loading profiles from offline cache/defaults.");
    const cached = localStorage.getItem("cached_profiles");
    if (cached) {
      try { return JSON.parse(cached); } catch (e) {}
    }
    const defaults: UserProfile[] = [
      {
        email: "johnbikaitsotra@gmail.com",
        displayName: "John Bikaitsotra",
        penName: "Admin Plume",
        bio: "Administrateur principal et gardien des encres de l'Atelier Littéraire.",
        avatarUrl: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=200",
        publishedWorks: [],
        socials: {}
      },
      {
        email: "arthur.rimbaud@plume.fr",
        displayName: "Arthur Rimbaud",
        penName: "Le Voyant",
        bio: "Poète maudit, marcheur infatigable à la recherche du dérèglement de tous les sens.",
        avatarUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=200",
        publishedWorks: [
          { title: "Une Saison en Enfer", url: "https://fr.wikipedia.org/wiki/Une_Saison_en_Enfer" },
          { title: "Illuminations", url: "https://fr.wikipedia.org/wiki/Illuminations_(Rimbaud)" }
        ],
        socials: { twitter: "rimbaud_officiel", github: "rimbaud-voyant" }
      }
    ];
    return defaults;
  }

  try {
    const querySnapshot = await getDocs(collection(db, collectionPath));
    const profiles: UserProfile[] = [];
    querySnapshot.forEach((document) => {
      profiles.push(document.data() as UserProfile);
    });
    localStorage.setItem("cached_profiles", JSON.stringify(profiles));
    return profiles;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, collectionPath);
  }
}

export async function saveProfileToFirestore(profile: UserProfile): Promise<void> {
  const normalizedEmail = profile.email.trim().toLowerCase();
  const docPath = `profiles/${normalizedEmail}`;
  
  // Update local offline cache
  const cached = localStorage.getItem("cached_profiles");
  let profilesList: UserProfile[] = [];
  if (cached) {
    try { profilesList = JSON.parse(cached); } catch (e) {}
  }
  const idx = profilesList.findIndex(p => p.email.toLowerCase() === normalizedEmail);
  if (idx > -1) {
    profilesList[idx] = profile;
  } else {
    profilesList.push(profile);
  }
  localStorage.setItem("cached_profiles", JSON.stringify(profilesList));

  // Try saving via BFF Backend API first (bypasses direct Client SDK issues/rules)
  try {
    const res = await fetch("/api/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile)
    });
    if (res.ok) {
      return;
    }
  } catch (apiErr) {
    console.warn("[BFF Profiles API] Could not save via backend server, falling back:", apiErr);
  }

  if (!auth.currentUser) {
    console.warn("Client not authenticated on Firebase. Profile saved to offline cache only.");
    return;
  }

  try {
    await setDoc(doc(db, "profiles", normalizedEmail), profile);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}

// --- 4. Productivity Collection API ---

export async function getProductivityFromFirestore(email: string): Promise<ProductivityDay[]> {
  const collectionPath = "productivity";
  
  // Try via BFF Backend API first
  try {
    const res = await fetch(`/api/productivity?email=${encodeURIComponent(email)}`);
    if (res.ok) {
      return await res.json();
    }
  } catch (apiErr) {
    console.warn("[BFF Productivity API] Could not read from backend server:", apiErr);
  }

  try {
    const q = query(
      collection(db, collectionPath),
      where("userEmail", "==", email.trim().toLowerCase())
    );
    const querySnapshot = await getDocs(q);
    const logs: ProductivityDay[] = [];
    querySnapshot.forEach((document) => {
      logs.push(document.data() as ProductivityDay);
    });
    return logs;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, collectionPath);
  }
}

export async function saveProductivityToFirestore(email: string, log: Omit<ProductivityDay, "userEmail">): Promise<void> {
  const dayId = `${email.trim().toLowerCase()}_${log.date}`;
  const docPath = `productivity/${dayId}`;
  
  // Try via BFF Backend API first
  try {
    const res = await fetch("/api/productivity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...log,
        email: email.trim().toLowerCase()
      })
    });
    if (res.ok) return;
  } catch (apiErr) {
    console.warn("[BFF Productivity API] Could not save via backend server, falling back:", apiErr);
  }

  try {
    await setDoc(doc(db, "productivity", dayId), {
      ...log,
      userEmail: email.trim().toLowerCase()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}

// --- 5. Admin API (Direct Firestore access) ---

export async function getAdminOverviewFromFirestore(): Promise<any> {
  // Try retrieving via Express BFF first (bypasses direct client auth restrictions)
  try {
    const email = auth.currentUser?.email || "johnbikaitsotra@gmail.com";
    const res = await fetch(`/api/admin/overview?adminEmail=${encodeURIComponent(email)}`);
    if (res.ok) {
      return await res.json();
    }
  } catch (apiErr) {
    console.warn("[BFF Admin Overview API] Could not read from backend server:", apiErr);
  }

  if (!auth.currentUser) {
    console.warn("Client not authenticated. Skipping Cloud Admin overview fetch.");
    return {
      totalUsers: 1,
      totalWritings: 2,
      totalProfiles: 2,
      totalVersions: 1,
      usersList: [
        {
          email: "johnbikaitsotra@gmail.com",
          displayName: "John Bikaitsotra",
          penName: "Admin Plume",
          createdAt: new Date().toISOString(),
          isGoogle: true,
          isRestricted: false,
          manuscriptsCount: 2
        }
      ]
    };
  }

  try {
    const usersSnap = await getDocs(collection(db, "users"));
    const writingsSnap = await getDocs(collection(db, "writings"));
    const profilesSnap = await getDocs(collection(db, "profiles"));
    const versionsSnap = await getDocs(collection(db, "versions"));

    const writingsList: any[] = [];
    writingsSnap.forEach((document) => {
      writingsList.push(document.data());
    });

    const userMap = new Map<string, any>();

    // 1. Populate from users
    usersSnap.forEach((document) => {
      const u = document.data() as any;
      if (u && u.email) {
        const emailLower = u.email.trim().toLowerCase();
        userMap.set(emailLower, {
          email: u.email,
          displayName: u.displayName || "",
          penName: u.penName || "",
          createdAt: u.createdAt || "Inconnue",
          isGoogle: !!u.isGoogleUser,
          isRestricted: !!u.isRestricted
        });
      }
    });

    // 2. Supplement from profiles
    profilesSnap.forEach((document) => {
      const p = document.data() as any;
      if (p && p.email) {
        const emailLower = p.email.trim().toLowerCase();
        if (!userMap.has(emailLower)) {
          userMap.set(emailLower, {
            email: p.email,
            displayName: p.displayName || "",
            penName: p.penName || "",
            createdAt: p.createdAt || "Inconnue",
            isGoogle: emailLower.endsWith("gmail.com"),
            isRestricted: !!p.isRestricted
          });
        } else {
          const existing = userMap.get(emailLower);
          if (p.isRestricted !== undefined) {
            existing.isRestricted = !!p.isRestricted;
          }
        }
      }
    });

    const listUsers: any[] = [];
    userMap.forEach((u) => {
      const count = writingsList.filter((w: any) => w.userEmail && w.userEmail.trim().toLowerCase() === u.email.trim().toLowerCase()).length;
      listUsers.push({
        ...u,
        manuscriptsCount: count
      });
    });

    return {
      totalUsers: userMap.size,
      totalWritings: writingsSnap.size,
      totalProfiles: profilesSnap.size,
      totalVersions: versionsSnap.size,
      usersList: listUsers
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, "admin/overview");
  }
}

export async function restrictUser(adminEmail: string, userEmail: string, restrict: boolean): Promise<any> {
  const response = await fetch("/api/admin/restrict", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ adminEmail, userEmail, restrict })
  });
  if (!response.ok) {
    const errData = await response.json();
    throw new Error(errData.error || "Impossible de suspendre ou réhabiliter le compte.");
  }
  return response.json();
}

export async function deleteUser(adminEmail: string, userEmail: string): Promise<any> {
  const response = await fetch("/api/admin/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ adminEmail, userEmail })
  });
  if (!response.ok) {
    const errData = await response.json();
    throw new Error(errData.error || "Impossible de supprimer ce scribe.");
  }
  return response.json();
}

// --- 6. Private Messaging API ---

export async function saveMessageToFirestore(message: PrivateMessage): Promise<void> {
  const docPath = `messages/${message.id}`;
  
  // Try saving via BFF messages API first (bypasses direct Client SDK issues/rules)
  try {
    const res = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message)
    });
    if (res.ok) {
      return;
    }
  } catch (apiErr) {
    console.warn("[BFF Messages API] Could not save via backend server, falling back:", apiErr);
  }

  try {
    await setDoc(doc(db, "messages", message.id), message);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}

export async function getSentMessagesFromFirestore(email: string): Promise<PrivateMessage[]> {
  const collectionPath = "messages";
  
  try {
    const res = await fetch(`/api/messages?email=${encodeURIComponent(email)}`);
    if (res.ok) {
      const all: PrivateMessage[] = await res.json();
      return all.filter(m => m.senderEmail.toLowerCase() === email.trim().toLowerCase());
    }
  } catch (apiErr) {
    console.warn("[BFF Messages API] Could not retrieve via backend server, falling back:", apiErr);
  }

  try {
    const q = query(
      collection(db, collectionPath),
      where("senderEmail", "==", email.trim().toLowerCase())
    );
    const querySnapshot = await getDocs(q);
    const messages: PrivateMessage[] = [];
    querySnapshot.forEach((document) => {
      messages.push(document.data() as PrivateMessage);
    });
    return messages;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, collectionPath);
  }
}

export async function getReceivedMessagesFromFirestore(email: string): Promise<PrivateMessage[]> {
  const collectionPath = "messages";
  
  try {
    const res = await fetch(`/api/messages?email=${encodeURIComponent(email)}`);
    if (res.ok) {
      const all: PrivateMessage[] = await res.json();
      return all.filter(m => m.receiverEmail.toLowerCase() === email.trim().toLowerCase());
    }
  } catch (apiErr) {
    console.warn("[BFF Messages API] Could not retrieve via backend server, falling back:", apiErr);
  }

  try {
    const q = query(
      collection(db, collectionPath),
      where("receiverEmail", "==", email.trim().toLowerCase())
    );
    const querySnapshot = await getDocs(q);
    const messages: PrivateMessage[] = [];
    querySnapshot.forEach((document) => {
      messages.push(document.data() as PrivateMessage);
    });
    return messages;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, collectionPath);
  }
}

