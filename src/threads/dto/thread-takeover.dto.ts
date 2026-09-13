import { ApiProperty } from '@nestjs/swagger';

export class ThreadTakeoverPreviewDto {
  @ApiProperty()
  threadId!: string;

  @ApiProperty({ type: Number, nullable: true })
  ownerPid!: number | null;

  @ApiProperty({
    type: [String],
    description:
      'Conversations whose writer will be stopped with this Codex process.',
  })
  affectedThreadIds!: string[];

  @ApiProperty({
    description:
      'Short-lived, single-use confirmation for this exact writer and affected conversation set.',
  })
  confirmationToken!: string;
}

export class ThreadTakeoverRequestDto {
  @ApiProperty()
  confirmationToken!: string;
}
