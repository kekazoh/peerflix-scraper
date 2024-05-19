import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import { ScraperRequest } from '../interfaces';

export class EventsConsumer {
  private kafka: Kafka;

  private consumer: Consumer;

  constructor(groupId: string) {
    this.kafka = new Kafka({
      clientId: 'peerflix-scraper',
      brokers: ['localhost:19092'],
    });

    this.consumer = this.kafka.consumer({ groupId });
  }

  async consume(consumeTopic: string, consumeFn: (message: ScraperRequest) => Promise<void>): Promise<void> {
    await this.consumer.connect();
    await this.consumer.subscribe({ topic: consumeTopic });

    await this.consumer.run({
      eachMessage: async (payload: EachMessagePayload) => {
        const { topic, partition, message } = payload;
        if (!message.value) return;
        console.log(`Received message on topic ${topic}, partition ${partition}: ${message.value}`);
        // Process the message here
        await consumeFn(JSON.parse(message.value.toString()));
      },
    });
  }

  async disconnect(): Promise<void> {
    await this.consumer.disconnect();
  }
}
