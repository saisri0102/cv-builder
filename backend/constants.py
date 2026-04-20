# backend/constants.py

# curated skills set
SKILLS_SET = {
    "python", "java", "javascript", "typescript", "c", "c++", "c#",
    "go", "ruby", "php", "sql", "mysql", "postgresql", "mongodb", "redis",
    "html", "css", "react", "vue", "angular", "node", "express",
    "django", "flask", "spring", "fastapi",
    "aws", "gcp", "azure", "docker", "kubernetes", "terraform", "linux",
    "rest", "api", "graphql", "microservices",
    "machine learning", "ml", "nlp", "cv", "pandas", "numpy",
    "scikit-learn", "tensorflow", "pytorch",
    "git", "agile", "scrum", "testing", "pytest", "jest",
    "excel", "tableau", "powerbi", "data", "analysis"
}

# stopwords (common words we ignore)
STOP_WORDS = {
    "the", "and", "or", "an", "a", "to", "of", "for", "on",
    "with", "by", "in", "at", "as", "is", "are", "was", "were",
    "be", "been", "this", "that", "it"
}

# domain phrases we want to catch
PHRASES = {
    "machine learning",
    "deep learning",
    "data science",
    "artificial intelligence",
    "natural language processing",
    "computer vision",
    "cloud computing",
    "project management",
    "software development",
}

# synonyms/aliases mapping
SYNONYMS = {
    "ml": {"machine learning"},
    "ai": {"artificial intelligence"},
    "nlp": {"natural language processing"},
    "cv": {"computer vision"},
    "js": {"javascript"},
    "py": {"python"},
}
