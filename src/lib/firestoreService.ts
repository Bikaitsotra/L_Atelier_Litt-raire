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
  try {
    await setDoc(doc(db, "versions", version.id), version);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}

// --- 3. Profiles Collection API ---

export async function getProfilesFromFirestore(): Promise<UserProfile[]> {
  const collectionPath = "profiles";
  try {
    const querySnapshot = await getDocs(collection(db, collectionPath));
    const profiles: UserProfile[] = [];
    querySnapshot.forEach((document) => {
      profiles.push(document.data() as UserProfile);
    });
    return profiles;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, collectionPath);
  }
}

export async function saveProfileToFirestore(profile: UserProfile): Promise<void> {
  const normalizedEmail = profile.email.trim().toLowerCase();
  const docPath = `profiles/${normalizedEmail}`;
  try {
    await setDoc(doc(db, "profiles", normalizedEmail), profile);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}

// --- 4. Productivity Collection API ---

export async function getProductivityFromFirestore(email: string): Promise<ProductivityDay[]> {
  const collectionPath = "productivity";
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
  try {
    await setDoc(doc(db, "messages", message.id), message);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}

export async function getSentMessagesFromFirestore(email: string): Promise<PrivateMessage[]> {
  const collectionPath = "messages";
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

