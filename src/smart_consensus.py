#!/usr/bin/env python3
"""
Smart Consensus Engine - Semantic similarity based consensus measurement
Replaces primitive Jaccard index with embedding-based semantic analysis
"""

import json
import sys
import numpy as np
import spacy
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity
from typing import List, Dict, Any
import re
import warnings

# Suppress warnings from transformers
warnings.filterwarnings("ignore")

class SmartConsensusEngine:
    def __init__(self):
        try:
            # Load multilingual sentence transformer
            self.encoder = SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2')
            
            # Load spaCy model for entity extraction
            self.nlp = spacy.load('xx_ent_wiki_sm')
            
            # Cache for embeddings to improve performance
            self.cache = {}
            
        except Exception as e:
            print(f"Error initializing SmartConsensusEngine: {e}", file=sys.stderr)
            sys.exit(1)
    
    def measure_consensus(self, responses: List[str]) -> float:
        """
        Measure consensus between AI responses using semantic similarity
        
        Args:
            responses: List of AI response strings
            
        Returns:
            Consensus score between 0 and 1
        """
        try:
            if len(responses) < 2:
                return 1.0
            
            # Step 1: Calculate semantic similarity using embeddings
            embeddings = self._get_embeddings(responses)
            similarity_matrix = cosine_similarity(embeddings)
            
            # Get upper triangle (avoid diagonal and duplicates)
            n = len(responses)
            similarities = []
            for i in range(n):
                for j in range(i+1, n):
                    similarities.append(similarity_matrix[i][j])
            
            base_similarity = np.mean(similarities) if similarities else 0.0
            
            # Step 2: Extract and compare numerical/temporal entities
            entity_adjustment = self._compare_entities(responses)
            
            # Step 3: Detect contradictions and negations
            contradiction_penalty = self._detect_contradictions(responses)
            
            # Step 4: Combine all factors into final consensus score
            final_consensus = base_similarity * entity_adjustment * (1 - contradiction_penalty)
            
            # Ensure score is between 0 and 1
            return max(0.0, min(1.0, final_consensus))
            
        except Exception as e:
            print(f"Error measuring consensus: {e}", file=sys.stderr)
            return 0.0
    
    def _get_embeddings(self, texts: List[str]) -> np.ndarray:
        """Get sentence embeddings with caching"""
        embeddings = []
        
        for text in texts:
            # Simple cache key (in production, use proper hashing)
            cache_key = text[:100] + f"_{len(text)}"
            
            if cache_key in self.cache:
                embeddings.append(self.cache[cache_key])
            else:
                # Clean text for better embedding quality
                clean_text = self._clean_text(text)
                embedding = self.encoder.encode([clean_text])[0]
                self.cache[cache_key] = embedding
                embeddings.append(embedding)
        
        return np.array(embeddings)
    
    def _clean_text(self, text: str) -> str:
        """Clean text for better semantic analysis"""
        # Remove markdown formatting
        text = re.sub(r'[*_#]+', '', text)
        
        # Remove excessive whitespace
        text = re.sub(r'\s+', ' ', text)
        
        # Limit length to avoid token limits
        if len(text) > 500:
            text = text[:500]
        
        return text.strip()
    
    def _compare_entities(self, responses: List[str]) -> float:
        """
        Compare numerical and temporal entities between responses
        Returns adjustment factor (1.0 = no adjustment, >1.0 = bonus for similar entities)
        """
        try:
            all_dates = []
            all_numbers = []
            
            for response in responses:
                doc = self.nlp(response)
                
                # Extract dates and years
                dates = []
                for ent in doc.ents:
                    if ent.label_ == "DATE":
                        # Try to extract year from date
                        year_match = re.search(r'20\d{2}', ent.text)
                        if year_match:
                            dates.append(int(year_match.group()))
                
                # Extract numbers and percentages
                numbers = []
                for ent in doc.ents:
                    if ent.label_ in ["CARDINAL", "PERCENT", "MONEY"]:
                        # Extract numeric value
                        num_match = re.search(r'[\d.]+', ent.text)
                        if num_match:
                            try:
                                numbers.append(float(num_match.group()))
                            except ValueError:
                                pass
                
                all_dates.append(dates)
                all_numbers.append(numbers)
            
            # Calculate similarity bonuses
            date_similarity = self._calculate_numeric_similarity(all_dates)
            number_similarity = self._calculate_numeric_similarity(all_numbers)
            
            # Weighted average of entity similarities
            entity_bonus = 0.6 * date_similarity + 0.4 * number_similarity
            
            # Return adjustment factor (1.0 to 1.5 range)
            return 1.0 + (entity_bonus * 0.5)
            
        except Exception as e:
            print(f"Error comparing entities: {e}", file=sys.stderr)
            return 1.0
    
    def _calculate_numeric_similarity(self, number_lists: List[List[float]]) -> float:
        """Calculate similarity between numeric values across responses"""
        if not any(numbers for numbers in number_lists):
            return 0.0
        
        # Flatten all numbers
        all_numbers = []
        for numbers in number_lists:
            all_numbers.extend(numbers)
        
        if len(all_numbers) < 2:
            return 0.0
        
        # Calculate relative differences
        similarities = []
        for i in range(len(number_lists)):
            for j in range(i+1, len(number_lists)):
                nums1 = number_lists[i]
                nums2 = number_lists[j]
                
                if not nums1 or not nums2:
                    continue
                
                # Find closest matches between the two lists
                best_similarity = 0.0
                for n1 in nums1:
                    for n2 in nums2:
                        if max(n1, n2) == 0:
                            continue
                        
                        # Calculate relative difference
                        rel_diff = abs(n1 - n2) / max(n1, n2)
                        similarity = max(0, 1 - rel_diff)
                        best_similarity = max(best_similarity, similarity)
                
                similarities.append(best_similarity)
        
        return np.mean(similarities) if similarities else 0.0
    
    def _detect_contradictions(self, responses: List[str]) -> float:
        """
        Detect explicit contradictions and negations
        Returns penalty factor (0.0 = no penalty, 1.0 = maximum penalty)
        """
        try:
            negation_patterns = [
                r'\b(not|inte|aldrig|never|no|nej)\b',
                r'\b(impossible|omöjligt|unlikely|osannolikt)\b',
                r'\b(disagree|håller inte med|motsätter)\b'
            ]
            
            contradiction_signals = []
            
            for i, resp1 in enumerate(responses):
                for j, resp2 in enumerate(responses[i+1:], i+1):
                    
                    # Check for opposing sentiment
                    resp1_lower = resp1.lower()
                    resp2_lower = resp2.lower()
                    
                    # Count negation words in each response
                    neg_count1 = sum(len(re.findall(pattern, resp1_lower)) for pattern in negation_patterns)
                    neg_count2 = sum(len(re.findall(pattern, resp2_lower)) for pattern in negation_patterns)
                    
                    # High negation asymmetry suggests contradiction
                    if abs(neg_count1 - neg_count2) > 2:
                        contradiction_signals.append(0.5)
                    
                    # Look for explicit disagreement markers
                    disagreement_markers = [
                        r'\bhowever\b', r'\bbut\b', r'\bmen\b', r'\bdock\b',
                        r'\bon the contrary\b', r'\btvärtom\b'
                    ]
                    
                    disagreement_count = sum(
                        len(re.findall(marker, resp1_lower)) + len(re.findall(marker, resp2_lower))
                        for marker in disagreement_markers
                    )
                    
                    if disagreement_count > 1:
                        contradiction_signals.append(0.3)
            
            # Return average contradiction penalty
            if contradiction_signals:
                return min(0.8, np.mean(contradiction_signals))
            else:
                return 0.0
                
        except Exception as e:
            print(f"Error detecting contradictions: {e}", file=sys.stderr)
            return 0.0


def main():
    """CLI interface for consensus measurement"""
    try:
        # Read responses from stdin
        input_data = sys.stdin.read().strip()
        
        if not input_data:
            print(json.dumps({"error": "No input provided"}))
            sys.exit(1)
        
        # Parse JSON input
        try:
            data = json.loads(input_data)
            responses = data.get("responses", [])
        except json.JSONDecodeError:
            # Fallback: treat input as single response
            responses = [input_data]
        
        if not responses:
            print(json.dumps({"error": "No responses provided"}))
            sys.exit(1)
        
        # Initialize engine and measure consensus
        engine = SmartConsensusEngine()
        consensus_score = engine.measure_consensus(responses)
        
        # Return result
        result = {
            "consensus_score": round(float(consensus_score), 4),
            "algorithm": "semantic_embedding",
            "num_responses": len(responses)
        }
        
        print(json.dumps(result))
        
    except Exception as e:
        error_result = {
            "error": str(e),
            "consensus_score": 0.0,
            "algorithm": "semantic_embedding_error"
        }
        print(json.dumps(error_result))
        sys.exit(1)


if __name__ == "__main__":
    main()