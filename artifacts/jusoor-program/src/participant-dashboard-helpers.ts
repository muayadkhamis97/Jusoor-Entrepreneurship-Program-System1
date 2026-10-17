export function getParticipantNextAction(hasAcceptedEnrollment: boolean): {
  href: string;
  titleKey: string;
  descriptionKey: string;
} {
  return hasAcceptedEnrollment
    ? {
        href: '#participant-learning',
        titleKey: 'Continue with your program learning',
        descriptionKey: 'Your learning materials and upcoming sessions are available below.',
      }
    : {
        href: '#participant-program-progress',
        titleKey: 'Check your application progress',
        descriptionKey: 'Your application status and program updates are gathered below.',
      };
}

export function participantSignInInstructions(email: string): string {
  return `Create an account or sign in to the Program Hub using ${email}. No email was sent; the program team assigned access to a program and business.`;
}
