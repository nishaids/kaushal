import type { RubricPreset } from './types'

/**
 * Discipline packs.
 *
 * A starting rubric per discipline, written by reading how practitioners in
 * that field actually talk about work. Every dimension here is observable in a
 * submission: an instructor can point at the thing and say why the number is
 * what it is. Nothing abstract ("creativity", "talent", "potential") appears
 * anywhere, because an unscoreable dimension discredits every scoreable one
 * next to it.
 *
 * These are starting points, not the truth. An academy forks one and edits it,
 * and the fork is what its scores are recorded against.
 *
 * `aiAssessable: false` is used deliberately and often. A photograph of a
 * drawing contains no information about rehearsal discipline, and an audio clip
 * contains none about posture. Marking those human-only is more honest than
 * asking a model to guess and then dressing the guess up with a confidence
 * number.
 */

export const RUBRIC_PRESETS: RubricPreset[] = [
  {
    id: 'drawing',
    discipline: 'drawing',
    name: 'Drawing and painting',
    tagline: 'Observational drawing, painting and studio practice.',
    description:
      'Five things you can point at on the paper. Built for representational study work; fork it and edit the wording to match how you teach.',
    dimensions: [
      {
        key: 'proportion',
        label: 'Proportion',
        longLabel: 'Proportion & placement',
        question: 'Are the relationships between parts, and their positions, accurate?',
        levels: [
          { from: 1, to: 3, descriptor: 'Sizes and positions drift; parts do not relate to one another consistently.' },
          { from: 4, to: 7, descriptor: 'Major relationships hold; smaller parts still slip.' },
          { from: 8, to: 10, descriptor: 'Relationships and placement read as measured throughout.' },
        ],
      },
      {
        key: 'line_control',
        label: 'Line',
        longLabel: 'Line control',
        question: 'Is the mark-making confident, consistent and intentional?',
        levels: [
          { from: 1, to: 3, descriptor: 'Hesitant, sketchy repetition; the line searches rather than states.' },
          { from: 4, to: 7, descriptor: 'Lines commit in the main forms, break down in detail.' },
          { from: 8, to: 10, descriptor: 'Single decisive strokes with deliberate weight variation.' },
        ],
      },
      {
        key: 'value_range',
        label: 'Value',
        longLabel: 'Value range',
        question: 'How far apart are the darkest dark and the lightest light?',
        levels: [
          { from: 1, to: 3, descriptor: 'Everything sits in a narrow mid-grey band; no true dark, no clean light.' },
          { from: 4, to: 7, descriptor: 'A range is present but the darks stop short of full.' },
          { from: 8, to: 10, descriptor: 'Full scale used, from paper white to a genuine darkest dark.' },
        ],
      },
      {
        key: 'edge_quality',
        label: 'Edges',
        longLabel: 'Edge quality',
        question: 'Is there variation between hard, soft and lost edges?',
        levels: [
          { from: 1, to: 3, descriptor: 'Every edge is treated the same way, usually hard outline.' },
          { from: 4, to: 7, descriptor: 'Some softening appears, but it is not used to direct attention.' },
          { from: 8, to: 10, descriptor: 'Hard, soft and lost edges are chosen deliberately and read as depth.' },
        ],
      },
      {
        key: 'composition',
        label: 'Composition',
        longLabel: 'Composition',
        question: 'How well is the picture space used?',
        levels: [
          { from: 1, to: 3, descriptor: 'Subject floats or crowds; large areas of the sheet do nothing.' },
          { from: 4, to: 7, descriptor: 'Placement is reasonable; margins and negative space are uneven.' },
          { from: 8, to: 10, descriptor: 'The whole sheet is in play; placement carries the picture.' },
        ],
      },
    ],
  },

  {
    id: 'music_instrumental',
    discipline: 'music',
    name: 'Instrumental music',
    tagline: 'Instrumental performance, assessed from a recording.',
    description:
      'Assessed from an audio or video recording of a played passage. Tone and technique need video or a teacher in the room; the rubric says so rather than pretending otherwise.',
    dimensions: [
      {
        key: 'pitch_accuracy',
        label: 'Pitch',
        longLabel: 'Pitch accuracy',
        question: 'Are the notes in tune and correct against the written part?',
        evidence: ['audio', 'video'],
        levels: [
          { from: 1, to: 3, descriptor: 'Frequent wrong notes; intonation drifts audibly.' },
          { from: 4, to: 7, descriptor: 'Mostly accurate; intonation slips at position changes or in the extremes.' },
          { from: 8, to: 10, descriptor: 'Secure throughout, including the difficult intervals.' },
        ],
      },
      {
        key: 'rhythm',
        label: 'Rhythm',
        longLabel: 'Rhythmic accuracy',
        question: 'Are note values and rests held for their written length?',
        evidence: ['audio', 'video'],
        levels: [
          { from: 1, to: 3, descriptor: 'Note values approximate; rests are cut short.' },
          { from: 4, to: 7, descriptor: 'Simple rhythms secure; dotted and syncopated figures rush.' },
          { from: 8, to: 10, descriptor: 'Written rhythm is reproduced exactly, including rests.' },
        ],
      },
      {
        key: 'tempo_stability',
        label: 'Tempo',
        longLabel: 'Tempo and pulse',
        question: 'Is the pulse steady, and are changes of tempo deliberate?',
        evidence: ['audio', 'video'],
        levels: [
          { from: 1, to: 3, descriptor: 'Pulse wanders; the piece speeds up through easy passages.' },
          { from: 4, to: 7, descriptor: 'Broadly steady; hard bars slow down.' },
          { from: 8, to: 10, descriptor: 'Pulse holds under pressure; any rubato is clearly a choice.' },
        ],
      },
      {
        key: 'dynamics',
        label: 'Dynamics',
        longLabel: 'Dynamics and phrasing',
        question: 'Is there a real difference between loud and soft, shaped into phrases?',
        evidence: ['audio', 'video'],
        levels: [
          { from: 1, to: 3, descriptor: 'One volume throughout; no phrase shape.' },
          { from: 4, to: 7, descriptor: 'Marked dynamics observed; phrases not yet shaped between them.' },
          { from: 8, to: 10, descriptor: 'A full dynamic range used to shape line and direction.' },
        ],
      },
      {
        key: 'technique',
        label: 'Technique',
        longLabel: 'Technique and tone',
        question: 'Is the physical technique producing a controlled, consistent tone?',
        evidence: ['video', 'observation'],
        aiAssessable: false,
        levels: [
          { from: 1, to: 3, descriptor: 'Tone is uneven; physical tension is visible or audible.' },
          { from: 4, to: 7, descriptor: 'Tone is consistent at moderate difficulty.' },
          { from: 8, to: 10, descriptor: 'Controlled tone maintained across range and dynamic.' },
        ],
      },
    ],
  },

  {
    id: 'dance',
    discipline: 'dance',
    name: 'Dance',
    tagline: 'Technique and performance, assessed from video.',
    description:
      'Assessed from a video of a phrase or routine. Filmed square-on and full-body, or the placement dimensions cannot be judged.',
    dimensions: [
      {
        key: 'alignment',
        label: 'Alignment',
        longLabel: 'Posture and alignment',
        question: 'Is the body held in the alignment the form asks for?',
        evidence: ['video', 'observation'],
        levels: [
          { from: 1, to: 3, descriptor: 'Alignment collapses under movement.' },
          { from: 4, to: 7, descriptor: 'Held when still, lost during transitions.' },
          { from: 8, to: 10, descriptor: 'Maintained throughout, including under speed.' },
        ],
      },
      {
        key: 'balance_control',
        label: 'Balance',
        longLabel: 'Balance and control',
        question: 'Are positions arrived at and held without correction?',
        evidence: ['video', 'observation'],
        levels: [
          { from: 1, to: 3, descriptor: 'Visible corrections; positions are not held.' },
          { from: 4, to: 7, descriptor: 'Held briefly; exits are uncontrolled.' },
          { from: 8, to: 10, descriptor: 'Arrived at cleanly, held, and left under control.' },
        ],
      },
      {
        key: 'musicality',
        label: 'Timing',
        longLabel: 'Timing and musicality',
        question: 'Does the movement land with the music rather than near it?',
        evidence: ['video'],
        levels: [
          { from: 1, to: 3, descriptor: 'Counts are approximate; movement trails the beat.' },
          { from: 4, to: 7, descriptor: 'On the beat; not yet using the phrasing.' },
          { from: 8, to: 10, descriptor: 'Movement is placed inside the phrase, not just on the count.' },
        ],
      },
      {
        key: 'technique_execution',
        label: 'Technique',
        longLabel: 'Technique execution',
        question: 'Are the steps performed as the vocabulary defines them?',
        evidence: ['video', 'observation'],
        levels: [
          { from: 1, to: 3, descriptor: 'Shapes are approximate.' },
          { from: 4, to: 7, descriptor: 'Correct at slow tempo, degrades at speed.' },
          { from: 8, to: 10, descriptor: 'Vocabulary is accurate at performance tempo.' },
        ],
      },
      {
        key: 'expression',
        label: 'Performance',
        longLabel: 'Performance and projection',
        question: 'Is the performance projected outward, with intent carried through?',
        evidence: ['video', 'observation'],
        aiAssessable: false,
        levels: [
          { from: 1, to: 3, descriptor: 'Focus stays internal; the phrase is counted rather than performed.' },
          { from: 4, to: 7, descriptor: 'Projection appears in familiar sections.' },
          { from: 8, to: 10, descriptor: 'Sustained intent throughout, including in transitions.' },
        ],
      },
    ],
  },

  {
    id: 'coding',
    discipline: 'coding',
    name: 'Programming',
    tagline: 'Programming work, assessed from submitted code.',
    description:
      'Assessed from a code submission and, where provided, its tests. Correctness is checkable; the rest is judgement, and the rubric keeps them apart.',
    dimensions: [
      {
        key: 'correctness',
        label: 'Correctness',
        longLabel: 'Correctness',
        question: 'Does it produce the right result, including at the edges?',
        evidence: ['code', 'text'],
        levels: [
          { from: 1, to: 3, descriptor: 'Fails on the stated example.' },
          { from: 4, to: 7, descriptor: 'Handles the main path; edge cases unhandled.' },
          { from: 8, to: 10, descriptor: 'Correct including empty, boundary and malformed input.' },
        ],
      },
      {
        key: 'readability',
        label: 'Readability',
        longLabel: 'Readability and naming',
        question: 'Could another student read this and know what it does?',
        evidence: ['code'],
        levels: [
          { from: 1, to: 3, descriptor: 'Single-letter names; structure has to be reverse-engineered.' },
          { from: 4, to: 7, descriptor: 'Reasonable names; long functions doing several things.' },
          { from: 8, to: 10, descriptor: 'Intent is legible from names and shape alone.' },
        ],
      },
      {
        key: 'problem_solving',
        label: 'Approach',
        longLabel: 'Problem solving',
        question: 'Is the approach suited to the problem rather than forced onto it?',
        evidence: ['code', 'text'],
        levels: [
          { from: 1, to: 3, descriptor: 'Brute force where the problem clearly asks for structure.' },
          { from: 4, to: 7, descriptor: 'Workable approach; obvious simplification missed.' },
          { from: 8, to: 10, descriptor: 'Approach fits the problem and the constraints.' },
        ],
      },
      {
        key: 'debugging',
        label: 'Debugging',
        longLabel: 'Debugging and testing',
        question: 'Is there evidence the student checked their own work?',
        evidence: ['code', 'text'],
        levels: [
          { from: 1, to: 3, descriptor: 'No checking; failure modes untested.' },
          { from: 4, to: 7, descriptor: 'Happy path verified.' },
          { from: 8, to: 10, descriptor: 'Failure cases deliberately probed and handled.' },
        ],
      },
      {
        key: 'structure',
        label: 'Structure',
        longLabel: 'Structure',
        question: 'Is the code organised into parts with clear responsibilities?',
        evidence: ['code'],
        appliesFromLevel: 2,
        levels: [
          { from: 1, to: 3, descriptor: 'One long block.' },
          { from: 4, to: 7, descriptor: 'Split into functions with some overlap of concern.' },
          { from: 8, to: 10, descriptor: 'Each part has one job and the seams are in sensible places.' },
        ],
      },
    ],
  },

  {
    id: 'photography',
    discipline: 'photography',
    name: 'Photography',
    tagline: 'Photographic work, assessed from the image.',
    description:
      'Assessed from the submitted photograph. Technical dimensions are measurable from the file; storytelling is a judgement and is marked as one.',
    dimensions: [
      {
        key: 'exposure',
        label: 'Exposure',
        longLabel: 'Exposure',
        question: 'Is the tonal range held without losing the highlights or blocking the shadows?',
        levels: [
          { from: 1, to: 3, descriptor: 'Clipped highlights or dead shadows across much of the frame.' },
          { from: 4, to: 7, descriptor: 'Broadly right; some recoverable clipping.' },
          { from: 8, to: 10, descriptor: 'Full range retained where it matters.' },
        ],
      },
      {
        key: 'focus_sharpness',
        label: 'Focus',
        longLabel: 'Focus and sharpness',
        question: 'Is the intended subject sharp, and is anything soft soft on purpose?',
        levels: [
          { from: 1, to: 3, descriptor: 'Subject missed focus, or camera shake throughout.' },
          { from: 4, to: 7, descriptor: 'Subject acceptably sharp; focal plane slightly off.' },
          { from: 8, to: 10, descriptor: 'Focus is placed deliberately and holds.' },
        ],
      },
      {
        key: 'framing',
        label: 'Framing',
        longLabel: 'Framing and composition',
        question: 'Does the frame include what it needs and exclude what it does not?',
        levels: [
          { from: 1, to: 3, descriptor: 'Distracting edges; subject placed without reason.' },
          { from: 4, to: 7, descriptor: 'Competent placement; edges not yet controlled.' },
          { from: 8, to: 10, descriptor: 'Every edge is a decision.' },
        ],
      },
      {
        key: 'lighting',
        label: 'Lighting',
        longLabel: 'Lighting',
        question: 'Is the light shaping the subject rather than merely illuminating it?',
        levels: [
          { from: 1, to: 3, descriptor: 'Flat or harsh light applied without regard to the subject.' },
          { from: 4, to: 7, descriptor: 'Direction is chosen; quality not yet controlled.' },
          { from: 8, to: 10, descriptor: 'Direction and quality both serve the subject.' },
        ],
      },
      {
        key: 'storytelling',
        label: 'Story',
        longLabel: 'Storytelling',
        question: 'Does the frame communicate something a viewer can name?',
        aiAssessable: false,
        levels: [
          { from: 1, to: 3, descriptor: 'A record of a thing being present.' },
          { from: 4, to: 7, descriptor: 'A subject and a mood, loosely held.' },
          { from: 8, to: 10, descriptor: 'A clear idea a viewer can state without help.' },
        ],
      },
    ],
  },

  {
    id: 'craft',
    discipline: 'craft',
    name: 'Craft and making',
    tagline: 'Handmade work — pottery, textiles, woodwork, jewellery.',
    description:
      'Assessed from photographs of the finished piece, ideally from more than one angle. Fork it and cut the dimensions that do not apply to your medium.',
    dimensions: [
      {
        key: 'construction',
        label: 'Construction',
        longLabel: 'Construction and joins',
        question: 'Is the piece soundly made where its parts meet?',
        levels: [
          { from: 1, to: 3, descriptor: 'Joins are visibly weak or failing.' },
          { from: 4, to: 7, descriptor: 'Sound but visible; tolerances uneven.' },
          { from: 8, to: 10, descriptor: 'Joins are sound and considered.' },
        ],
      },
      {
        key: 'finish',
        label: 'Finish',
        longLabel: 'Surface and finish',
        question: 'Is the surface finished to the standard the material allows?',
        levels: [
          { from: 1, to: 3, descriptor: 'Tool marks and unevenness left throughout.' },
          { from: 4, to: 7, descriptor: 'Finished on the main faces; edges and undersides missed.' },
          { from: 8, to: 10, descriptor: 'Consistent finish across the whole piece.' },
        ],
      },
      {
        key: 'accuracy',
        label: 'Accuracy',
        longLabel: 'Accuracy to design',
        question: 'Does the made object match the intended dimensions and form?',
        levels: [
          { from: 1, to: 3, descriptor: 'Departs from the design without intent.' },
          { from: 4, to: 7, descriptor: 'Close; symmetry or repeats drift.' },
          { from: 8, to: 10, descriptor: 'Matches the design, including repeated elements.' },
        ],
      },
      {
        key: 'material_handling',
        label: 'Material',
        longLabel: 'Material handling',
        question: 'Is the material worked in the way it wants to be worked?',
        levels: [
          { from: 1, to: 3, descriptor: 'Material is fought; stress and tearing visible.' },
          { from: 4, to: 7, descriptor: 'Handled correctly in the straightforward areas.' },
          { from: 8, to: 10, descriptor: 'Behaviour of the material is anticipated and used.' },
        ],
      },
      {
        key: 'process_discipline',
        label: 'Process',
        longLabel: 'Process and safety',
        question: 'Was the process followed, including preparation and safe practice?',
        evidence: ['observation'],
        aiAssessable: false,
        levels: [
          { from: 1, to: 3, descriptor: 'Steps skipped; workspace and safety not managed.' },
          { from: 4, to: 7, descriptor: 'Process followed with reminders.' },
          { from: 8, to: 10, descriptor: 'Process managed independently, safely, start to finish.' },
        ],
      },
    ],
  },

  {
    id: 'sports_coaching',
    discipline: 'sports',
    name: 'Sports coaching',
    tagline: 'Movement and skill execution, assessed from video.',
    description:
      'Assessed from video of a drill or match situation. Filmed from a consistent angle, or technique comparisons across weeks are not comparable.',
    dimensions: [
      {
        key: 'technique_form',
        label: 'Form',
        longLabel: 'Technique and form',
        question: 'Is the movement pattern executed as coached?',
        evidence: ['video', 'observation'],
        levels: [
          { from: 1, to: 3, descriptor: 'Pattern breaks down under any pressure.' },
          { from: 4, to: 7, descriptor: 'Correct in isolation; degrades in play.' },
          { from: 8, to: 10, descriptor: 'Holds under game speed and contact.' },
        ],
      },
      {
        key: 'consistency',
        label: 'Consistency',
        longLabel: 'Consistency',
        question: 'Does the skill repeat reliably across attempts?',
        evidence: ['video', 'observation'],
        levels: [
          { from: 1, to: 3, descriptor: 'Occasional success, mostly chance.' },
          { from: 4, to: 7, descriptor: 'Repeats in drills, not in play.' },
          { from: 8, to: 10, descriptor: 'Reliable across attempts and contexts.' },
        ],
      },
      {
        key: 'decision_making',
        label: 'Decisions',
        longLabel: 'Decision making',
        question: 'Is the right option chosen for the situation, at the right time?',
        evidence: ['video', 'observation'],
        aiAssessable: false,
        levels: [
          { from: 1, to: 3, descriptor: 'Executes one option regardless of situation.' },
          { from: 4, to: 7, descriptor: 'Reads simple situations; late under pressure.' },
          { from: 8, to: 10, descriptor: 'Reads and chooses early.' },
        ],
      },
      {
        key: 'conditioning',
        label: 'Conditioning',
        longLabel: 'Conditioning',
        question: 'Is performance maintained across the session rather than falling away?',
        evidence: ['observation'],
        aiAssessable: false,
        levels: [
          { from: 1, to: 3, descriptor: 'Quality drops sharply after the opening minutes.' },
          { from: 4, to: 7, descriptor: 'Holds most of the session.' },
          { from: 8, to: 10, descriptor: 'Quality maintained throughout.' },
        ],
      },
    ],
  },

  {
    id: 'language_speaking',
    discipline: 'language',
    name: 'Language — speaking',
    tagline: 'Spoken language, assessed from a recording.',
    description:
      'Assessed from an audio or video recording of the learner speaking. Written work needs a separate rubric.',
    dimensions: [
      {
        key: 'fluency',
        label: 'Fluency',
        longLabel: 'Fluency',
        question: 'Does speech run at a workable pace without stalling?',
        evidence: ['audio', 'video'],
        levels: [
          { from: 1, to: 3, descriptor: 'Frequent long pauses; sentences abandoned.' },
          { from: 4, to: 7, descriptor: 'Runs on familiar topics; hesitates elsewhere.' },
          { from: 8, to: 10, descriptor: 'Sustained speech; pauses are for thought, not for words.' },
        ],
      },
      {
        key: 'pronunciation',
        label: 'Pronunciation',
        longLabel: 'Pronunciation',
        question: 'Is the speech intelligible to a listener unused to the accent?',
        evidence: ['audio', 'video'],
        levels: [
          { from: 1, to: 3, descriptor: 'Frequent breakdowns in intelligibility.' },
          { from: 4, to: 7, descriptor: 'Generally clear; specific sounds recur as problems.' },
          { from: 8, to: 10, descriptor: 'Consistently intelligible, including stress and intonation.' },
        ],
      },
      {
        key: 'grammar_accuracy',
        label: 'Accuracy',
        longLabel: 'Grammatical accuracy',
        question: 'Are structures used correctly at the level being taught?',
        evidence: ['audio', 'text'],
        levels: [
          { from: 1, to: 3, descriptor: 'Errors in basic structures impede meaning.' },
          { from: 4, to: 7, descriptor: 'Basic structures secure; errors in complex forms.' },
          { from: 8, to: 10, descriptor: 'Accurate across the structures taught.' },
        ],
      },
      {
        key: 'vocabulary_range',
        label: 'Vocabulary',
        longLabel: 'Vocabulary range',
        question: 'Is vocabulary sufficient and precise for the topic?',
        evidence: ['audio', 'text'],
        levels: [
          { from: 1, to: 3, descriptor: 'Restricted to memorised phrases.' },
          { from: 4, to: 7, descriptor: 'Adequate; reaches for approximations.' },
          { from: 8, to: 10, descriptor: 'Precise and varied for the topic.' },
        ],
      },
      {
        key: 'interaction',
        label: 'Interaction',
        longLabel: 'Interaction',
        question: 'Can the learner take and hold a turn in a real exchange?',
        evidence: ['video', 'observation'],
        aiAssessable: false,
        levels: [
          { from: 1, to: 3, descriptor: 'Responds only when prompted directly.' },
          { from: 4, to: 7, descriptor: 'Takes turns; does not yet develop the exchange.' },
          { from: 8, to: 10, descriptor: 'Initiates, responds and repairs misunderstanding.' },
        ],
      },
    ],
  },

  {
    id: 'vocational',
    discipline: 'vocational',
    name: 'Vocational training',
    tagline: 'Trade and technical skills — a general starting point.',
    description:
      'A deliberately general starting point for trades. Fork it and replace the dimensions with the competencies your qualification actually lists.',
    dimensions: [
      {
        key: 'task_completion',
        label: 'Completion',
        longLabel: 'Task completion',
        question: 'Was the task completed to the specification given?',
        evidence: ['image', 'observation'],
        levels: [
          { from: 1, to: 3, descriptor: 'Incomplete or not to specification.' },
          { from: 4, to: 7, descriptor: 'Complete; deviations from specification remain.' },
          { from: 8, to: 10, descriptor: 'Complete and to specification.' },
        ],
      },
      {
        key: 'quality_of_work',
        label: 'Quality',
        longLabel: 'Quality of work',
        question: 'Would this pass an inspection in a working setting?',
        evidence: ['image', 'observation'],
        levels: [
          { from: 1, to: 3, descriptor: 'Would be rejected.' },
          { from: 4, to: 7, descriptor: 'Acceptable with rework.' },
          { from: 8, to: 10, descriptor: 'Would pass as submitted.' },
        ],
      },
      {
        key: 'tool_use',
        label: 'Tools',
        longLabel: 'Tool and equipment use',
        question: 'Are the right tools selected and used correctly?',
        evidence: ['observation', 'video'],
        aiAssessable: false,
        levels: [
          { from: 1, to: 3, descriptor: 'Wrong tools, or correct tools misused.' },
          { from: 4, to: 7, descriptor: 'Correct selection; technique still developing.' },
          { from: 8, to: 10, descriptor: 'Correct selection and confident technique.' },
        ],
      },
      {
        key: 'safety',
        label: 'Safety',
        longLabel: 'Safe working practice',
        question: 'Was safe practice followed throughout, unprompted?',
        evidence: ['observation'],
        aiAssessable: false,
        levels: [
          { from: 1, to: 3, descriptor: 'Unsafe practice observed.' },
          { from: 4, to: 7, descriptor: 'Safe when reminded.' },
          { from: 8, to: 10, descriptor: 'Safe practice maintained independently.' },
        ],
      },
      {
        key: 'efficiency',
        label: 'Efficiency',
        longLabel: 'Working efficiency',
        question: 'Was the task completed in a workable time without waste?',
        evidence: ['observation'],
        aiAssessable: false,
        levels: [
          { from: 1, to: 3, descriptor: 'Significantly over time; material wasted.' },
          { from: 4, to: 7, descriptor: 'Within a reasonable time.' },
          { from: 8, to: 10, descriptor: 'Efficient in both time and material.' },
        ],
      },
    ],
  },

  {
    id: 'design',
    discipline: 'design',
    name: 'Design',
    tagline: 'Graphic, product and communication design.',
    description:
      'Assessed from submitted design work and, where provided, the brief it answers. Design is judged against intent, so the brief matters as much as the artefact.',
    dimensions: [
      {
        key: 'brief_response',
        label: 'Brief',
        longLabel: 'Response to brief',
        question: 'Does the work answer the problem the brief actually set?',
        evidence: ['image', 'document'],
        levels: [
          { from: 1, to: 3, descriptor: 'Answers a different problem.' },
          { from: 4, to: 7, descriptor: 'Addresses the brief; misses a stated constraint.' },
          { from: 8, to: 10, descriptor: 'Answers the brief including its constraints.' },
        ],
      },
      {
        key: 'hierarchy',
        label: 'Hierarchy',
        longLabel: 'Visual hierarchy',
        question: 'Does the eye arrive in the intended order?',
        levels: [
          { from: 1, to: 3, descriptor: 'Everything competes; no entry point.' },
          { from: 4, to: 7, descriptor: 'Primary element reads; secondary order unclear.' },
          { from: 8, to: 10, descriptor: 'Reading order is controlled and deliberate.' },
        ],
      },
      {
        key: 'typography',
        label: 'Typography',
        longLabel: 'Typography',
        question: 'Is type set with control over size, spacing and measure?',
        levels: [
          { from: 1, to: 3, descriptor: 'Defaults throughout; spacing unconsidered.' },
          { from: 4, to: 7, descriptor: 'Deliberate choices; spacing inconsistent.' },
          { from: 8, to: 10, descriptor: 'Type is set, not merely placed.' },
        ],
      },
      {
        key: 'craft_execution',
        label: 'Craft',
        longLabel: 'Craft and execution',
        question: 'Is the work built cleanly — alignment, spacing, consistency?',
        levels: [
          { from: 1, to: 3, descriptor: 'Misalignment and inconsistency throughout.' },
          { from: 4, to: 7, descriptor: 'Broadly clean; inconsistencies on close inspection.' },
          { from: 8, to: 10, descriptor: 'Holds up under close inspection.' },
        ],
      },
      {
        key: 'concept',
        label: 'Concept',
        longLabel: 'Concept',
        question: 'Is there an idea underneath the execution?',
        aiAssessable: false,
        levels: [
          { from: 1, to: 3, descriptor: 'Decoration without an idea.' },
          { from: 4, to: 7, descriptor: 'An idea is present but not carried through.' },
          { from: 8, to: 10, descriptor: 'A clear idea drives every decision.' },
        ],
      },
    ],
  },
]

export function findPreset(id: string): RubricPreset | undefined {
  return RUBRIC_PRESETS.find((p) => p.id === id)
}

export function presetsForDiscipline(discipline: string): RubricPreset[] {
  return RUBRIC_PRESETS.filter((p) => p.discipline === discipline)
}

/** Every discipline the product ships a starting rubric for. */
export function shippedDisciplines(): Array<{ id: string; label: string }> {
  const seen = new Map<string, string>()
  for (const p of RUBRIC_PRESETS) {
    if (!seen.has(p.discipline)) {
      seen.set(p.discipline, p.discipline.charAt(0).toUpperCase() + p.discipline.slice(1))
    }
  }
  return [...seen].map(([id, label]) => ({ id, label }))
}
