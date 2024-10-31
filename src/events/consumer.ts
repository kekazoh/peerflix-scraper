import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import { ScraperRequest } from '../interfaces';
import logger from '../lib/logger';

export class EventsConsumer {
  private kafka: Kafka;

  private consumer: Consumer;

  constructor(groupId: string) {
    logger.debug('Initializing EventsConsumer');
    const KAFKA_BROKERS = process.env.KAFKA ? process.env.KAFKA.split(',') : ['localhost:19092'];
    logger.debug({ KAFKA_BROKERS }, 'Kafka brokers configured');

    this.kafka = new Kafka({
      clientId: 'peerflix-scraper',
      brokers: KAFKA_BROKERS,
    });
    logger.debug('Kafka instance created');

    this.consumer = this.kafka.consumer({ groupId });
    logger.debug({ groupId }, 'Kafka consumer created');
  }

  async consume(consumeTopic: string, consumeFn: (message: ScraperRequest) => Promise<void>): Promise<void> {
    logger.debug('Connecting consumer');
    await this.consumer.connect();
    logger.debug({ topic: consumeTopic }, 'Subscribing to topic');
    await this.consumer.subscribe({ topic: consumeTopic });

    logger.info({ topic: consumeTopic }, 'Started consuming from topic');
    await this.consumer.run({
      partitionsConsumedConcurrently: process.env.CONCURRENT_PARTITIONS 
        ? parseInt(process.env.CONCURRENT_PARTITIONS, 10) : 1,
      eachMessage: async (payload: EachMessagePayload) => {
        const { topic, partition, message } = payload;
        if (!message.value) {
          logger.warn('Received message with no value');
          return;
        }
        logger.debug({ topic, partition, message: message.value.toString() }, 'Received message');
        try {
          const parsedMessage = JSON.parse(message.value.toString());
          logger.debug({ parsedMessage }, 'Parsed message');
          await consumeFn(parsedMessage);
          logger.debug('Message processed successfully');
        } catch (error) {
          logger.error({ error }, 'Error processing message');
        }
      },
    });
  }

  async disconnect(): Promise<void> {
    logger.debug('Disconnecting consumer');
    await this.consumer.disconnect();
    logger.info('Consumer disconnected');
  }
}
