export function getParticipantNextAction(hasAcceptedEnrollment: boolean): {
  href: string;
  titleKey: string;
  descriptionKey: string;
} {
  return hasAcceptedEnrollment
    ? {
        href: '/participant/learning',
        titleKey: 'Continue with your program learning',
        descriptionKey: 'Your learning materials and upcoming sessions are on the Learning page.',
      }
    : {
        href: '/participant',
        titleKey: 'Check your application progress',
        descriptionKey: 'Your application status is on the Program progress page.',
      };
}

export function participantSignInInstructions(email: string, expiresAt: Date): string {
  const expiry = expiresAt.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
  return `An invitation email was sent to ${email}. Create an account or sign in to the Program Hub using this verified email by ${expiry} to access the assigned program and business.`;
}
