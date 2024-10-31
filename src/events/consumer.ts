import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import { ScraperRequest } from '../interfaces';

export class EventsConsumer {
  private kafka: Kafka;

  private consumer: Consumer;

  constructor(groupId: string) {
    const KAFKA_BROKERS = process.env.KAFKA ? process.env.KAFKA.split(',') : ['localhost:19092'];
    this.kafka = new Kafka({
      clientId: 'peerflix-scraper',
      brokers: KAFKA_BROKERS,
    });

    this.consumer = this.kafka.consumer({ groupId });
  }

  async consume(consumeTopic: string, consumeFn: (message: ScraperRequest) => Promise<void>): Promise<void> {
    await this.consumer.connect();
    await this.consumer.subscribe({ topic: consumeTopic });

    await this.consumer.run({
      partitionsConsumedConcurrently: process.env.CONCURRENT_PARTITIONS 
        ? parseInt(process.env.CONCURRENT_PARTITIONS, 10) : 1,
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
